// functions/src/principleVault.ts
// ═══════════════════════════════════════════════════════════════════════════
// WINNING PRINCIPLES VAULT — Per-user learning system
// Extracts structural principles (not exact patterns) from winning creatives
// and feeds them as focused DO/DON'T rules into generation prompts.
// ═══════════════════════════════════════════════════════════════════════════

import * as admin from "firebase-admin";
import { LOGIC_MODEL } from "./modelConfig.js";

function getDb() { return admin.firestore(); }

// ─── Interfaces ──────────────────────────────────────────────────────────

export interface VaultPrinciple {
    principleId: string;
    userId: string;
    type: 'copy_structure' | 'emotional_register' | 'hook_mechanics' | 'visual_pattern' | 'strategy_combo' | 'anti_pattern';
    text: string;
    textAr: string | null;
    polarity: 'positive' | 'negative';
    confidence: number;
    evidenceCount: number;
    evidenceIds: string[];
    sourceSignals: {
        thumbsUp: number;
        favorites: number;
        metaPerformance: number;
        metaSpentNoResult: number;
        negative: number;
    };
    hookAngle: string | null;
    hookType: string | null;
    niche: string | null;
    language: string | null;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    lastUpdated: admin.firestore.Timestamp | admin.firestore.FieldValue;
    lastUsedInGeneration: admin.firestore.Timestamp | null;
    version: number;
    active: boolean;
}

interface StructuralTraits {
    hookWordCount: number;
    subheadWordCount: number;
    openerType: string;      // 'number' | 'question' | 'command' | 'conditional' | 'statement' | 'address'
    hookAngle: string | null;
    hookType: string | null;
    angleTypeCombo: string | null;
    layoutTemplate: string | null;
    aspectRatio: string | null;
    creativeModes: string[];
    adTone: string | null;
    language: string | null;
    niche: string | null;
    hookText: string;
    subheadText: string;
}

type GeminiCaller = (params: { model: string; contents: any; config?: any }) => Promise<any>;

// Phase-to-type relevance mapping
const PHASE_TYPES: Record<string, string[]> = {
    hooks: ['copy_structure', 'emotional_register', 'hook_mechanics', 'strategy_combo', 'anti_pattern'],
    concepts: ['visual_pattern', 'hook_mechanics', 'strategy_combo', 'anti_pattern'],
    caption: ['copy_structure', 'emotional_register', 'anti_pattern'],
};

// ─── Trait Extraction (Programmatic — No AI) ─────────────────────────────

function classifyOpener(text: string): string {
    if (!text) return 'statement';
    const trimmed = text.trim();
    // Number opener: starts with digit or Arabic numeral
    if (/^\d|^[٠-٩]/.test(trimmed)) return 'number';
    // Question: ends with ? or ؟, or starts with question words
    if (/[?؟]$/.test(trimmed) || /^(هل|كيف|لماذا|ليش|ما |متى|أين|كم|ماذا|why|how|what|when|do you)/i.test(trimmed)) return 'question';
    // Command: starts with imperative verb patterns
    if (/^(توقف|ابدأ|اكتشف|تعلم|جرب|اترك|غيّر|ارفع|stop|start|try|get|join|build|make|use)/i.test(trimmed)) return 'command';
    // Conditional
    if (/^(لو |إذا |if |when )/i.test(trimmed)) return 'conditional';
    // Direct address
    if (/^(أنت|you )/i.test(trimmed)) return 'address';
    return 'statement';
}

function countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractTraits(genDoc: admin.firestore.DocumentData): StructuralTraits {
    const output = genDoc.output || {};
    const input = genDoc.input || {};
    const identity = genDoc.creativeIdentity || {};

    const hookText = (output.hookText || '').trim();
    const subheadText = (output.subhead || '').trim();

    const hookAngle = identity.hookAngle || input.coldHookAngle || null;
    const hookType = input.hookType || null;

    return {
        hookWordCount: countWords(hookText),
        subheadWordCount: countWords(subheadText),
        openerType: classifyOpener(hookText),
        hookAngle,
        hookType,
        angleTypeCombo: hookAngle && hookType ? `${hookAngle} + ${hookType}` : null,
        layoutTemplate: identity.contractTemplateId || null,
        aspectRatio: genDoc.metadata?.aspectRatio || null,
        creativeModes: identity.selectedModes || [],
        adTone: input.tone || null,
        language: input.language || null,
        niche: input.niche || input.productCategory || null,
        hookText,
        subheadText,
    };
}

function buildTraitSummary(traits: StructuralTraits[]): string {
    if (traits.length === 0) return 'No traits to analyze.';
    const total = traits.length;

    // Word count distribution
    const avgHookWords = Math.round(traits.reduce((s, t) => s + t.hookWordCount, 0) / total);
    const shortHeadlines = traits.filter(t => t.hookWordCount <= 7).length;

    // Opener distribution
    const openerCounts: Record<string, number> = {};
    traits.forEach(t => { openerCounts[t.openerType] = (openerCounts[t.openerType] || 0) + 1; });
    const topOpener = Object.entries(openerCounts).sort((a, b) => b[1] - a[1])[0];

    // Angle distribution
    const angleCounts: Record<string, number> = {};
    traits.filter(t => t.hookAngle).forEach(t => { angleCounts[t.hookAngle!] = (angleCounts[t.hookAngle!] || 0) + 1; });
    const topAngle = Object.entries(angleCounts).sort((a, b) => b[1] - a[1])[0];

    // Combo distribution
    const comboCounts: Record<string, number> = {};
    traits.filter(t => t.angleTypeCombo).forEach(t => { comboCounts[t.angleTypeCombo!] = (comboCounts[t.angleTypeCombo!] || 0) + 1; });
    const topCombo = Object.entries(comboCounts).sort((a, b) => b[1] - a[1])[0];

    // Layout distribution
    const layoutCounts: Record<string, number> = {};
    traits.filter(t => t.layoutTemplate).forEach(t => { layoutCounts[t.layoutTemplate!] = (layoutCounts[t.layoutTemplate!] || 0) + 1; });
    const topLayout = Object.entries(layoutCounts).sort((a, b) => b[1] - a[1])[0];

    const lines: string[] = [
        `Batch: ${total} creatives analyzed.`,
        `Average headline word count: ${avgHookWords}. ${shortHeadlines}/${total} had headlines ≤ 7 words.`,
        topOpener ? `Most common opener: ${topOpener[0]} (${topOpener[1]}/${total})` : '',
        topAngle ? `Most used hook angle: ${topAngle[0]} (${topAngle[1]}/${total})` : '',
        topCombo ? `Top angle+delivery combo: ${topCombo[0]} (${topCombo[1]}/${total})` : '',
        topLayout ? `Top layout: ${topLayout[0]} (${topLayout[1]}/${total})` : '',
    ];

    // Sample hook texts (for Gemini to analyze)
    const sampleHooks = traits.slice(0, 5).map((t, i) =>
        `  ${i + 1}. "${t.hookText}" | Sub: "${t.subheadText}" | Opener: ${t.openerType} | Words: ${t.hookWordCount}`
    );
    lines.push('\nSample hooks:', ...sampleHooks);

    return lines.filter(Boolean).join('\n');
}

// ─── Principle Extraction (Gemini-Powered) ───────────────────────────────

export async function extractPrinciples(
    userId: string,
    creativeIds: string[],
    signal: 'thumbsUp' | 'favorite' | 'metaPerformance',
    callGemini: GeminiCaller
): Promise<number> {
    if (!creativeIds.length) return 0;

    // Fetch generation docs
    const db = getDb();
    const genDocs: admin.firestore.DocumentData[] = [];
    for (const id of creativeIds.slice(0, 10)) {
        try {
            const snap = await db.collection('generations').doc(id).get();
            if (snap.exists) genDocs.push(snap.data()!);
        } catch { /* skip */ }
    }
    if (genDocs.length < 2) return 0;

    // Extract structural traits
    const traits = genDocs.map(extractTraits);
    const summary = buildTraitSummary(traits);

    // Determine common niche/language
    const niches = traits.map(t => t.niche).filter(Boolean);
    const commonNiche = niches.length > 0 ? mostFrequent(niches as string[]) : null;
    const languages = traits.map(t => t.language).filter(Boolean);
    const commonLang = languages.length > 0 ? mostFrequent(languages as string[]) : null;

    // Call Gemini to synthesize principles
    const extractionPrompt = `You are analyzing ${genDocs.length} WINNING ad creatives that received positive signals from the user.

STRUCTURAL TRAIT SUMMARY:
${summary}

YOUR TASK: Extract 2-5 STRUCTURAL PRINCIPLES from these winners.

RULES:
- A principle describes WHY something works STRUCTURALLY — not what specific content to repeat.
- GOOD principle: "Short headlines (5-7 words) with a number in the first 3 words grab more attention"
- BAD principle: "Use urgency hooks" (too vague, will cause repetition)
- BAD principle: "Write about pricing" (too specific to content, not structure)
- Each principle must be actionable: a copywriter should be able to apply it to ANY topic.
- Include both Arabic (textAr) and English (text) versions.

OUTPUT: Return ONLY a JSON array, no markdown, no explanation:
[
  {
    "type": "copy_structure" | "emotional_register" | "hook_mechanics" | "visual_pattern" | "strategy_combo",
    "text": "English principle",
    "textAr": "Arabic principle or null"
  }
]`;

    let principles: { type: string; text: string; textAr: string | null }[] = [];
    try {
        const response = await callGemini({
            model: LOGIC_MODEL,
            contents: { parts: [{ text: extractionPrompt }] },
            config: { temperature: 0.3 },
        });
        const raw = (response.text || '').trim();
        // Extract JSON from response
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            principles = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.warn('[principleVault] Gemini extraction failed:', e);
        return 0;
    }

    if (!principles.length) return 0;

    // Store or update principles
    let created = 0;
    const principlesRef = db.collection('principleVaults').doc(userId).collection('principles');

    for (const p of principles) {
        // Check for existing similar principle
        const existing = await findSimilarPrinciple(principlesRef, p.text, p.type);

        if (existing) {
            // Update existing principle
            const data = existing.data() as VaultPrinciple;
            const newEvidenceIds = [...(data.evidenceIds || []), ...creativeIds].slice(-20);
            const newCount = data.evidenceCount + creativeIds.length;
            const newSignals = { ...data.sourceSignals };
            const sigKey = signal === 'favorite' ? 'favorites' : signal;
            (newSignals as any)[sigKey] = ((newSignals as any)[sigKey] || 0) + creativeIds.length;
            const metaCount = newSignals.metaPerformance || 0;

            await existing.ref.update({
                evidenceCount: newCount,
                evidenceIds: newEvidenceIds,
                sourceSignals: newSignals,
                confidence: Math.min(0.95, 0.3 + (newCount * 0.08) + (metaCount * 0.12)),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                version: admin.firestore.FieldValue.increment(1),
            });
        } else {
            // Create new principle
            const principleId = `vp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const metaCount = signal === 'metaPerformance' ? creativeIds.length : 0;
            const newDoc: VaultPrinciple = {
                principleId,
                userId,
                type: p.type as VaultPrinciple['type'],
                text: p.text,
                textAr: p.textAr || null,
                polarity: 'positive',
                confidence: Math.min(0.95, 0.3 + (creativeIds.length * 0.08) + (metaCount * 0.12)),
                evidenceCount: creativeIds.length,
                evidenceIds: creativeIds.slice(-20),
                sourceSignals: {
                    thumbsUp: signal === 'thumbsUp' ? creativeIds.length : 0,
                    favorites: signal === 'favorite' ? creativeIds.length : 0,
                    metaPerformance: metaCount,
                    metaSpentNoResult: 0,
                    negative: 0,
                },
                hookAngle: traits[0]?.hookAngle || null,
                hookType: traits[0]?.hookType || null,
                niche: commonNiche,
                language: commonLang,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                lastUsedInGeneration: null,
                version: 1,
                active: true,
            };
            await principlesRef.doc(principleId).set(newDoc);
            created++;
        }
    }

    return created;
}

// ─── Anti-Principle Extraction ───────────────────────────────────────────

export async function extractAntiPrinciples(
    userId: string,
    creativeIds: string[],
    signal: 'negative' | 'metaSpentNoResult' | 'metaPerformance',
    callGemini: GeminiCaller
): Promise<number> {
    if (!creativeIds.length) return 0;

    const db = getDb();
    const genDocs: admin.firestore.DocumentData[] = [];
    for (const id of creativeIds.slice(0, 10)) {
        try {
            const snap = await db.collection('generations').doc(id).get();
            if (snap.exists) genDocs.push(snap.data()!);
        } catch { /* skip */ }
    }
    if (genDocs.length < 2) return 0;

    const traits = genDocs.map(extractTraits);
    const summary = buildTraitSummary(traits);

    const niches = traits.map(t => t.niche).filter(Boolean);
    const commonNiche = niches.length > 0 ? mostFrequent(niches as string[]) : null;
    const languages = traits.map(t => t.language).filter(Boolean);
    const commonLang = languages.length > 0 ? mostFrequent(languages as string[]) : null;

    const signalDesc = signal === 'metaSpentNoResult'
        ? 'These ads spent real budget ($20+) but got ZERO conversions, or had 500+ impressions with zero clicks.'
        : signal === 'metaPerformance'
            ? 'These ads had the worst performance metrics (bottom 25% CTR or ROAS < 0.5x).'
            : 'The user explicitly rejected these creatives with negative feedback.';

    const extractionPrompt = `You are analyzing ${genDocs.length} FAILED ad creatives.

FAILURE CONTEXT: ${signalDesc}

STRUCTURAL TRAIT SUMMARY:
${summary}

YOUR TASK: Extract 2-4 ANTI-PATTERNS — structural mistakes that caused these ads to fail.

RULES:
- An anti-pattern describes a STRUCTURAL flaw — not "the topic was wrong" but "the sentence structure made it weak."
- GOOD: "Headlines over 10 words lose attention — this audience responds to punchy, short copy"
- GOOD: "Formal Arabic tone alienates this audience — conversational register converts better"
- GOOD: "The angle+delivery combo '${traits[0]?.angleTypeCombo || 'N/A'}' underperformed — try different combinations"
- BAD: "Don't talk about pricing" (too content-specific)
- Each anti-pattern must be actionable: tell the copywriter what to AVOID structurally.

OUTPUT: Return ONLY a JSON array, no markdown:
[
  {
    "type": "anti_pattern",
    "text": "English anti-pattern",
    "textAr": "Arabic version or null"
  }
]`;

    let antiPatterns: { type: string; text: string; textAr: string | null }[] = [];
    try {
        const response = await callGemini({
            model: LOGIC_MODEL,
            contents: { parts: [{ text: extractionPrompt }] },
            config: { temperature: 0.3 },
        });
        const raw = (response.text || '').trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            antiPatterns = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.warn('[principleVault] Gemini anti-pattern extraction failed:', e);
        return 0;
    }

    if (!antiPatterns.length) return 0;

    let created = 0;
    const principlesRef = db.collection('principleVaults').doc(userId).collection('principles');

    for (const p of antiPatterns) {
        const existing = await findSimilarPrinciple(principlesRef, p.text, 'anti_pattern');

        if (existing) {
            const data = existing.data() as VaultPrinciple;
            const newEvidenceIds = [...(data.evidenceIds || []), ...creativeIds].slice(-20);
            const newCount = data.evidenceCount + creativeIds.length;
            const newSignals = { ...data.sourceSignals };
            const sigKey = signal === 'metaSpentNoResult' ? 'metaSpentNoResult' : signal === 'metaPerformance' ? 'metaPerformance' : 'negative';
            newSignals[sigKey] = (newSignals[sigKey] || 0) + creativeIds.length;
            const metaWeight = (newSignals.metaPerformance || 0) + (newSignals.metaSpentNoResult || 0);

            await existing.ref.update({
                evidenceCount: newCount,
                evidenceIds: newEvidenceIds,
                sourceSignals: newSignals,
                confidence: Math.min(0.95, 0.3 + (newCount * 0.08) + (metaWeight * 0.12)),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                version: admin.firestore.FieldValue.increment(1),
            });
        } else {
            const principleId = `vp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const metaWeight = signal !== 'negative' ? creativeIds.length : 0;
            const newDoc: VaultPrinciple = {
                principleId,
                userId,
                type: 'anti_pattern',
                text: p.text,
                textAr: p.textAr || null,
                polarity: 'negative',
                confidence: Math.min(0.95, 0.3 + (creativeIds.length * 0.08) + (metaWeight * 0.12)),
                evidenceCount: creativeIds.length,
                evidenceIds: creativeIds.slice(-20),
                sourceSignals: {
                    thumbsUp: 0,
                    favorites: 0,
                    metaPerformance: signal === 'metaPerformance' ? creativeIds.length : 0,
                    metaSpentNoResult: signal === 'metaSpentNoResult' ? creativeIds.length : 0,
                    negative: signal === 'negative' ? creativeIds.length : 0,
                },
                hookAngle: traits[0]?.hookAngle || null,
                hookType: traits[0]?.hookType || null,
                niche: commonNiche,
                language: commonLang,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                lastUsedInGeneration: null,
                version: 1,
                active: true,
            };
            await principlesRef.doc(principleId).set(newDoc);
            created++;
        }
    }

    return created;
}

// ─── Vault Consolidation ─────────────────────────────────────────────────

export async function consolidateVault(userId: string): Promise<void> {
    const db = getDb();
    const principlesRef = db.collection('principleVaults').doc(userId).collection('principles');
    const snap = await principlesRef.where('active', '==', true).get();

    if (snap.empty) return;

    const principles = snap.docs.map(d => ({ ref: d.ref, data: d.data() as VaultPrinciple }));

    // Prune: low confidence + low evidence + stale
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    for (const p of principles) {
        const lastUpdated = p.data.lastUpdated instanceof admin.firestore.Timestamp
            ? p.data.lastUpdated.toMillis()
            : Date.now();
        if (p.data.confidence < 0.2 && p.data.evidenceCount < 2 && lastUpdated < thirtyDaysAgo) {
            await p.ref.update({ active: false });
        }
    }

    // Cap: max 25 positive + 25 negative (50 total)
    const activePrinciples = principles.filter(p => p.data.active !== false);
    const positives = activePrinciples.filter(p => p.data.polarity === 'positive').sort((a, b) => b.data.confidence - a.data.confidence);
    const negatives = activePrinciples.filter(p => p.data.polarity === 'negative').sort((a, b) => b.data.confidence - a.data.confidence);

    // Deactivate excess
    for (const p of positives.slice(25)) {
        await p.ref.update({ active: false });
    }
    for (const p of negatives.slice(25)) {
        await p.ref.update({ active: false });
    }
}

// ─── Build Vault Block (Prompt Injection) ────────────────────────────────

export async function buildVaultBlock(
    userId: string,
    phase: string = 'hooks',
    niche?: string
): Promise<string> {
    const db = getDb();
    const principlesRef = db.collection('principleVaults').doc(userId).collection('principles');

    const snap = await principlesRef
        .where('active', '==', true)
        .orderBy('confidence', 'desc')
        .limit(50)
        .get();

    if (snap.empty) return '';

    const relevantTypes = PHASE_TYPES[phase] || PHASE_TYPES.hooks;
    const allPrinciples = snap.docs
        .map(d => ({ ref: d.ref, data: d.data() as VaultPrinciple }))
        .filter(p => relevantTypes.includes(p.data.type));

    // Optionally filter by niche (include null-niche principles too — they're cross-niche)
    const filtered = niche
        ? allPrinciples.filter(p => !p.data.niche || p.data.niche === niche)
        : allPrinciples;

    if (filtered.length === 0) return '';

    const positives = filtered.filter(p => p.data.polarity === 'positive').slice(0, 15);
    const negatives = filtered.filter(p => p.data.polarity === 'negative').slice(0, 15);

    if (positives.length === 0 && negatives.length === 0) return '';

    const lines: string[] = [
        '═══ WINNING PRINCIPLES VAULT (proven for this user) ═══',
    ];

    if (positives.length > 0) {
        lines.push('DO (structural patterns that win for this user):');
        for (const p of positives) {
            const conf = Math.round(p.data.confidence * 100);
            const displayText = p.data.textAr || p.data.text;
            lines.push(`- ${displayText} [${conf}% confidence, ${p.data.evidenceCount} winners]`);
        }
    }

    if (negatives.length > 0) {
        lines.push('');
        lines.push("DON'T (structural patterns that fail for this user):");
        for (const p of negatives) {
            const conf = Math.round(p.data.confidence * 100);
            const displayText = p.data.textAr || p.data.text;
            lines.push(`- AVOID: ${displayText} [${conf}% confidence, ${p.data.evidenceCount} failures]`);
        }
    }

    lines.push('');
    lines.push('Apply these principles structurally. Do NOT copy specific wording from past ads.');
    lines.push('═══ END VAULT ═══');

    // Update lastUsedInGeneration for included principles
    const batch = db.batch();
    for (const p of [...positives, ...negatives]) {
        batch.update(p.ref, { lastUsedInGeneration: admin.firestore.FieldValue.serverTimestamp() });
    }
    try { await batch.commit(); } catch { /* non-blocking */ }

    return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function mostFrequent(arr: string[]): string {
    const counts: Record<string, number> = {};
    arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

async function findSimilarPrinciple(
    ref: admin.firestore.CollectionReference,
    text: string,
    type: string
): Promise<admin.firestore.QueryDocumentSnapshot | null> {
    // Simple keyword overlap matching — check existing principles of same type
    const snap = await ref
        .where('active', '==', true)
        .where('type', '==', type)
        .get();

    if (snap.empty) return null;

    const inputWords = new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (inputWords.size === 0) return null;

    let bestMatch: admin.firestore.QueryDocumentSnapshot | null = null;
    let bestOverlap = 0;

    for (const doc of snap.docs) {
        const existingText = (doc.data().text || '').toLowerCase();
        const existingWords = new Set(existingText.split(/\s+/).filter((w: string) => w.length > 3));
        const overlap = [...inputWords].filter(w => existingWords.has(w)).length;
        const overlapRatio = overlap / Math.max(inputWords.size, existingWords.size);

        if (overlapRatio > 0.5 && overlapRatio > bestOverlap) {
            bestOverlap = overlapRatio;
            bestMatch = doc;
        }
    }

    return bestMatch;
}
