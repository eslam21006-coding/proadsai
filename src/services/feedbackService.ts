// src/services/feedbackService.ts
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — FEEDBACK & INTELLIGENCE SERVICE
// Drop this file into: src/services/feedbackService.ts
// ═══════════════════════════════════════════════════════════════════════════

import { db, functions } from '../firebase';
import {
    doc, setDoc, getDoc, collection, addDoc, getDocs,
    query, where, orderBy, limit, updateDoc, Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { AdInputs, AspectRatio, CarouselSlideCopy } from '../types';

// ─── FIRESTORE SAFETY ────────────────────────────────────────────────────────
// Firestore rejects `undefined` values in documents. This recursively strips
// them so callers don't need to sanitize every optional field individually.
function stripUndefined(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            result[k] = (typeof v === 'object' && v !== null) ? stripUndefined(v) : v;
        }
    }
    return result;
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type FeedbackRating = 'positive' | 'negative' | 'used' | null;

export type NegativeFeedbackTag =
    | 'too_generic'
    | 'wrong_tone'
    | 'not_relevant'
    | 'design_off'
    | 'copy_weak'
    | 'too_long'
    | 'too_short';

// Duplicated from functions/src/types.ts — frontend and backend are separate TS projects
// with independent tsconfigs, so types cannot be shared via import. Keep in sync manually.
export type FailureClass =
    | "prompt_malformed"
    | "model_error"
    | "validation_reject"
    | "slot_repair_failed"
    | "numeric_hallucination"
    | "combination_invalid"
    | "credit_insufficient";

export interface CostEstimate {
    modelTier: string | null;
    retryCount: number;
    estimatedTokens: number;
}

// Write-side carousel slide shape persisted on a generation doc. Intentionally narrower
// than the UI's `CarouselSlide` (types.ts): imageUrl is a non-null Storage/http URL or the
// 'pending_upload' sentinel (never base64), and there is no transient `status`.
export interface PersistedCarouselSlide {
    index: number;
    imageUrl: string;
    buildPlan: string;
    copy?: CarouselSlideCopy;
}

export interface GenerationRecord {
    id?: string;
    userId: string;
    timestamp: Timestamp;
    failureClass: FailureClass | null;
    costEstimate: CostEstimate | null;
    input: {
        productName: string;
        productCategory: string;
        niche: string;
        challenges: string;
        transformation: string;
        offer: string;
        cta?: string;
        tone: string;
        language: string;
        adType: 'single' | 'carousel';
        campaignType: 'cold' | 'retargeting';
        retargetingObjection?: string;
        retargetingObjections?: string[];  // Legacy — read-compat for old saved records
        customObjection?: string;
        testimonial?: string;
        brandColorPrimary?: string | null;
        brandColorSecondary?: string | null;
        // Art-direction / style fields — persisted so reflow's rerender-from-plan reproduces
        // the SAME hero look and art direction instead of regenerating with defaults.
        visualSubStyle?: string | null;
        adTone?: string | null;
        visualStyleFamily?: string | null;
        universeMode?: string | null;
        preferredUniverse?: string | null;
    };
    output: {
        phase: 'hooks' | 'concepts' | 'render' | 'caption';
        hookText?: string;
        subhead?: string;
        ctaText?: string;
        conceptText?: string;
        buildPlan?: string;
        // Phase 17 — user's approved TOV string (the concept-response text that was
        // fed to serverGenerateBuildPlan + serverGenerateFinalAd). Persisted so the
        // `generateSizeVariant` Cloud Function can read it for the cross-size edit
        // instruction + post-render validateCopyFidelity. Falls back to a best-effort
        // reconstruction from the build plan's machine plan ownership when missing
        // (pre-Phase-17 docs and the small fraction of new docs where the frontend
        // save raced and the field wasn't included).
        approvedTov?: string;
        blueprintText?: string;
        resolvedImagePrompt?: string;
        imageUrl?: string;
        // Per-slide carousel renders. Persisted so the reflowImage callable (scope
        // carousel_slide / carousel_all) and slide-retry can read each slide's buildPlan
        // (rerender-from-plan) and source URL. imageUrl is a short Storage/http URL or the
        // 'pending_upload' sentinel — never base64 (would blow Firestore's 1 MiB doc limit).
        carouselSlides?: PersistedCarouselSlide[];
        captionText?: string;
        fullResponse: string;
    };
    feedback: {
        rating: FeedbackRating;
        tags: NegativeFeedbackTag[];
        freeText: string;
        savedToFavorites: boolean;
    };
    metadata: {
        model: string;
        promptVersion: string;
        generationTimeMs: number;
        aspectRatio?: AspectRatio;
    };
    // ─── Creative identity chain ───────────────────────────────────
    creativeIdentity?: {
        generationId?: string;          // Self-reference for linking
        imageHash?: string;             // SHA hash of rendered image
        selectedModes?: string[];       // Mode/pair that produced this
        contractTemplateId?: string;    // Layout template key
        numericFidelity?: string;       // 'strict' | 'flexible' | 'none'
        offerFactsHash?: string;        // Hash of structured offer facts
        hookAngle?: string;             // Hook angle used
        universeId?: string;            // Universe selection (name)
        universeCategory?: string;      // Structured category from universe database
        universeStyleFamily?: string;   // 'realistic' | 'fantasy'
        rankingRequestId?: string;      // Ticket 3 linkage — which ranking decision influenced this
        rankingRequestFingerprint?: string;
        rankingAppliedSummary?: string;
    };
}

export interface UserPreferences {
    userId: string;
    totalGenerations: number;
    totalPositive: number;
    totalNegative: number;
    totalUsed: number;
    preferredCopyLength: 'short' | 'medium' | 'long' | 'unknown';
    commonNiches: string[];
    commonLanguage: string;
    avoidPatterns: string[];
    lastUpdated: Timestamp;
}

// ─── SERVICE ────────────────────────────────────────────────────────────────

class FeedbackService {

    // ═══ 1. SAVE GENERATION ═══
    async saveGeneration(
        userId: string,
        inputs: AdInputs,
        phase: GenerationRecord['output']['phase'],
        outputData: Partial<GenerationRecord['output']>,
        fullResponse: string,
        resolvedUniverse: string = '',
        model: string = 'gemini-3-flash',
        generationTimeMs: number = 0,
        aspectRatio?: AspectRatio,
        creativeIdentity?: GenerationRecord['creativeIdentity'],
        workspaceId?: string | null,
        failureClass: FailureClass | null = null,
        costEstimate: CostEstimate | null = null,
        resolutionTrace?: any | null
    ): Promise<string> {
        const record: Omit<GenerationRecord, 'id'> & { workspaceId?: string | null } = {
            userId,
            workspaceId: workspaceId || null,
            timestamp: Timestamp.now(),
            failureClass,
            costEstimate,
            input: {
                productName: inputs.productName || '',
                productCategory: inputs.productCategory || '',
                niche: inputs.targetAudience || '',
                challenges: inputs.challenges || '',
                transformation: inputs.transformation || '',
                offer: inputs.offerType || '',
                // Persist the CTA so reflow's rerender-from-plan (which rebuilds inputs
                // from this saved record) has it — its absence caused inputs.cta.length
                // to crash generateFinalAd on the rerender path.
                cta: inputs.cta || '',
                tone: resolvedUniverse,
                language: inputs.adLanguage || 'ar_fusha',
                adType: inputs.adMode || 'single',
                campaignType: inputs.campaignType || 'cold',
                retargetingObjection: (inputs as any).retargetingObjection || ((inputs as any).retargetingObjections || [])[0] || null,
                customObjection: (inputs as any).customObjection || null,
                testimonial: (inputs as any).testimonial || null,
                brandColorPrimary: inputs.brandColorPrimary || null,
                brandColorSecondary: inputs.brandColorSecondary || null,
                // Art-direction / style fields (canonical AdInputs names) so reflow rerender
                // keeps the same hero look + art direction. adType (=adMode) is already above.
                visualSubStyle: (inputs as any).visualSubStyle || null,
                adTone: (inputs as any).adTone || null,
                visualStyleFamily: (inputs as any).visualStyleFamily || null,
                universeMode: (inputs as any).universeMode || null,
                preferredUniverse: (inputs as any).preferredUniverse || null,
            },
            output: {
                phase,
                ...outputData,
                fullResponse: fullResponse.substring(0, 5000),
            },
            feedback: {
                rating: null,
                tags: [],
                freeText: '',
                savedToFavorites: false,
            },
            metadata: {
                model,
                promptVersion: 'v5.1',
                generationTimeMs,
                aspectRatio,
            },
            ...(creativeIdentity ? { creativeIdentity } : {}),
            ...(resolutionTrace ? { resolutionTrace } : {}),
        };

        try {
            // JSON deep-clone after stripUndefined: converts frozen objects, class
            // instances (e.g. Firestore Timestamp), and other non-plain values into
            // plain serializable objects, avoiding Firestore "invalid nested entity"
            // rejections on the write.
            const cleanRecord = JSON.parse(JSON.stringify(stripUndefined(record)));
            const ref = await addDoc(collection(db, 'generations'), cleanRecord);
            // Back-fill generationId for self-reference
            if (creativeIdentity && !creativeIdentity.generationId) {
                await updateDoc(ref, { 'creativeIdentity.generationId': ref.id }).catch(() => { });
            }
            return ref.id;
        } catch (err) {
            console.error('Failed to save generation:', err);
            return '';
        }
    }

    // ═══ 2. UPDATE FEEDBACK ═══
    async updateFeedback(
        generationId: string,
        rating: FeedbackRating,
        tags: NegativeFeedbackTag[] = [],
        freeText: string = ''
    ): Promise<void> {
        if (!generationId) return;
        try {
            const ref = doc(db, 'generations', generationId);
            await updateDoc(ref, {
                'feedback.rating': rating,
                'feedback.tags': tags,
                'feedback.freeText': freeText,
            });
            // Trigger Winning Principles Vault extraction (fire-and-forget)
            if (rating === 'positive' || rating === 'used') {
                httpsCallable(functions, 'triggerVaultExtraction')({ generationId, signal: 'positive' }).catch(() => {});
            } else if (rating === 'negative') {
                httpsCallable(functions, 'triggerVaultExtraction')({ generationId, signal: 'negative' }).catch(() => {});
            }
        } catch (err) {
            console.error('Failed to update feedback:', err);
        }
    }

    // ═══ 3. TOGGLE FAVORITE ═══
    async toggleFavorite(generationId: string, isFavorite: boolean): Promise<void> {
        if (!generationId) return;
        try {
            const ref = doc(db, 'generations', generationId);
            await updateDoc(ref, { 'feedback.savedToFavorites': isFavorite });
            // Trigger Winning Principles Vault extraction for favorites (fire-and-forget)
            if (isFavorite) {
                httpsCallable(functions, 'triggerVaultExtraction')({ generationId, signal: 'favorite' }).catch(() => {});
            }
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    }

    // ═══ 4. GET USER'S LIKED OUTPUTS (Few-Shot Injection) ═══
    async getLikedOutputs(
        userId: string,
        phase: GenerationRecord['output']['phase'] = 'hooks',
        maxResults: number = 5
    ): Promise<GenerationRecord[]> {
        try {
            const q = query(
                collection(db, 'generations'),
                where('userId', '==', userId),
                where('output.phase', '==', phase),
                where('feedback.rating', 'in', ['positive', 'used']),
                orderBy('timestamp', 'desc'),
                limit(maxResults)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as GenerationRecord));
        } catch (err) {
            console.error('Failed to get liked outputs:', err);
            return [];
        }
    }

    // ═══ 5. GET NICHE TOP OUTPUTS (Cross-User Intelligence) ═══
    async getNicheTopOutputs(
        niche: string,
        phase: GenerationRecord['output']['phase'] = 'hooks',
        maxResults: number = 10
    ): Promise<GenerationRecord[]> {
        try {
            const q = query(
                collection(db, 'generations'),
                where('input.niche', '==', niche),
                where('output.phase', '==', phase),
                where('feedback.rating', 'in', ['positive', 'used']),
                orderBy('timestamp', 'desc'),
                limit(maxResults)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as GenerationRecord));
        } catch (err) {
            console.error('Failed to get niche outputs:', err);
            return [];
        }
    }

    // ═══ 6. UPDATE USER PREFERENCES ═══
    async updateUserPreferences(userId: string): Promise<UserPreferences | null> {
        try {
            const q = query(
                collection(db, 'generations'),
                where('userId', '==', userId),
                orderBy('timestamp', 'desc'),
                limit(100)
            );
            const snap = await getDocs(q);
            const records = snap.docs.map(d => d.data() as GenerationRecord);
            const rated = records.filter(r => r.feedback.rating !== null);

            if (rated.length < 3) return null;

            const positive = rated.filter(r => r.feedback.rating === 'positive' || r.feedback.rating === 'used');
            const negative = rated.filter(r => r.feedback.rating === 'negative');

            // Analyze avoid patterns
            const avoidPatterns: string[] = [];
            const tagCounts: Record<string, number> = {};
            negative.forEach(r => {
                (r.feedback.tags || []).forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });
            Object.entries(tagCounts).forEach(([tag, count]) => {
                if (count >= 2) avoidPatterns.push(tag);
            });

            // Common niches
            const nicheCounts: Record<string, number> = {};
            records.forEach(r => {
                const n = r.input?.niche;
                if (n) nicheCounts[n] = (nicheCounts[n] || 0) + 1;
            });
            const commonNiches = Object.entries(nicheCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([n]) => n);

            // Common language
            const langCounts: Record<string, number> = {};
            records.forEach(r => {
                const l = r.input?.language;
                if (l) langCounts[l] = (langCounts[l] || 0) + 1;
            });
            const commonLanguage = Object.entries(langCounts)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'ar_fusha';

            // Copy length preference
            let avgLength = 0;
            positive.forEach(r => {
                avgLength += (r.output?.hookText || '').length + (r.output?.subhead || '').length;
            });
            avgLength = positive.length > 0 ? avgLength / positive.length : 0;
            const preferredCopyLength: UserPreferences['preferredCopyLength'] =
                avgLength < 30 ? 'short' : avgLength < 60 ? 'medium' : avgLength > 0 ? 'long' : 'unknown';

            const prefs: UserPreferences = {
                userId,
                totalGenerations: rated.length,
                totalPositive: positive.length,
                totalNegative: negative.length,
                totalUsed: rated.filter(r => r.feedback.rating === 'used').length,
                preferredCopyLength,
                commonNiches,
                commonLanguage,
                avoidPatterns,
                lastUpdated: Timestamp.now(),
            };

            await setDoc(doc(db, 'userPreferences', userId), prefs, { merge: true });
            return prefs;
        } catch (err) {
            console.error('Failed to update preferences:', err);
            return null;
        }
    }

    // ═══ 7. GET USER PREFERENCES ═══
    async getUserPreferences(userId: string): Promise<UserPreferences | null> {
        try {
            const snap = await getDoc(doc(db, 'userPreferences', userId));
            return snap.exists() ? (snap.data() as UserPreferences) : null;
        } catch (err) {
            console.error('Failed to get preferences:', err);
            return null;
        }
    }

    // ═══ 8. BUILD PERSONALIZATION PROMPT CONTEXT ═══
    async buildPersonalizationContext(
        userId: string,
        phase: GenerationRecord['output']['phase'] = 'hooks',
        niche?: string
    ): Promise<string> {
        const contextParts: string[] = [];

        // User preferences
        const prefs = await this.getUserPreferences(userId);
        if (prefs && prefs.totalGenerations >= 5) {
            const prefLines: string[] = [];
            if (prefs.preferredCopyLength !== 'unknown') {
                prefLines.push(`- User prefers ${prefs.preferredCopyLength} copy`);
            }
            if (prefs.avoidPatterns.length > 0) {
                const avoidMap: Record<string, string> = {
                    'too_generic': 'generic/safe approaches',
                    'wrong_tone': 'mismatched tone',
                    'not_relevant': 'off-target messaging',
                    'design_off': 'poor visual direction',
                    'copy_weak': 'weak/unconvincing copy',
                    'too_long': 'lengthy text',
                    'too_short': 'overly brief text',
                };
                const avoidDescriptions = prefs.avoidPatterns.map(p => avoidMap[p] || p);
                prefLines.push(`- User frequently dislikes: ${avoidDescriptions.join(', ')}`);
            }
            if (prefLines.length > 0) {
                contextParts.push(`USER PREFERENCES (from ${prefs.totalGenerations} past generations):\n${prefLines.join('\n')}`);
            }
        }

        // Few-shot from liked outputs
        const likedOutputs = await this.getLikedOutputs(userId, phase, 5);
        if (likedOutputs.length >= 2) {
            const examples = likedOutputs.map((r, i) => {
                if (phase === 'hooks') {
                    return `Example ${i + 1} (liked): Hook: "${r.output?.hookText || ''}" | Sub: "${r.output?.subhead || ''}"`;
                }
                if (phase === 'concepts') {
                    return `Example ${i + 1} (liked): ${(r.output?.conceptText || '').substring(0, 200)}`;
                }
                return '';
            }).filter(Boolean);

            if (examples.length > 0) {
                contextParts.push(`EXAMPLES THIS USER PREVIOUSLY LIKED:\n${examples.join('\n')}`);
            }
        }

        // ═══ PHASE 2C: REAL AD PERFORMANCE DATA ═══
        // Query adPerformance collection for this user's actual ad metrics
        try {
            const perfQuery = query(
                collection(db, 'adPerformance'),
                where('userId', '==', userId),
                orderBy('syncedAt', 'desc'),
                limit(20)
            );
            const perfSnap = await getDocs(perfQuery);
            if (perfSnap.size > 0) {
                const perfRecords = perfSnap.docs.map(d => d.data());

                // Calculate aggregate stats
                const totalSpend = perfRecords.reduce((s, r) => s + (r.spend || 0), 0);
                const totalClicks = perfRecords.reduce((s, r) => s + (r.clicks || 0), 0);
                const totalImpressions = perfRecords.reduce((s, r) => s + (r.impressions || 0), 0);
                const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';
                const withRoas = perfRecords.filter(r => r.roas && r.roas > 0);
                const avgRoas = withRoas.length > 0 ? (withRoas.reduce((s, r) => s + r.roas, 0) / withRoas.length).toFixed(1) : null;

                // Find top performers
                const sortedByCtr = [...perfRecords].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
                const topAds = sortedByCtr.slice(0, 3);

                const perfLines: string[] = [];
                perfLines.push(`- Account performance (last 30 days): ${totalImpressions.toLocaleString()} impressions, ${totalClicks.toLocaleString()} clicks, ${avgCtr}% avg CTR, $${totalSpend.toFixed(0)} spend`);
                if (avgRoas) perfLines.push(`- Average ROAS: ${avgRoas}x`);

                if (topAds.length > 0) {
                    perfLines.push(`- Top performing ads by CTR:`);
                    topAds.forEach((ad, i) => {
                        perfLines.push(`  ${i + 1}. "${ad.adName}" — CTR: ${(ad.ctr || 0).toFixed(2)}%, CPC: $${(ad.cpc || 0).toFixed(2)}${ad.roas ? `, ROAS: ${ad.roas.toFixed(1)}x` : ''}`);
                    });
                }

                // Find patterns in top performers
                const lowCtrAds = sortedByCtr.filter(a => (a.ctr || 0) < 1.0);
                if (lowCtrAds.length > 0 && topAds.length > 0) {
                    perfLines.push(`- ${lowCtrAds.length} ads below 1% CTR — avoid similar approaches`);
                }

                contextParts.push(`REAL AD PERFORMANCE DATA (from connected Meta Ads account):\n${perfLines.join('\n')}`);

                // Performance-based creative guidance
                const bestCtr = topAds[0]?.ctr || 0;
                if (bestCtr > 3) {
                    contextParts.push(`PERFORMANCE INSIGHT: This user's best ads exceed 3% CTR. Match this energy — use aggressive, specific hooks.`);
                } else if (bestCtr > 1.5) {
                    contextParts.push(`PERFORMANCE INSIGHT: User's ads average 1.5-3% CTR. Good baseline — push for stronger emotional triggers to break 3%.`);
                } else if (totalImpressions > 1000) {
                    contextParts.push(`PERFORMANCE INSIGHT: CTR is below 1.5%. Current creative approach isn't resonating. Try radically different angles.`);
                }
            }
        } catch (perfErr) {
            // Non-blocking — performance data is a bonus, not required
            console.warn('Performance data fetch failed (non-blocking):', perfErr);
        }

        // Cross-user niche intelligence — SAFE AGGREGATED PATTERNS ONLY
        // Never expose raw user content; surface pattern-level signals
        if (niche) {
            const nicheTop = await this.getNicheTopOutputs(niche, phase, 10);
            const otherUsersData = nicheTop.filter(r => r.userId !== userId);
            if (otherUsersData.length >= 3) {
                // Aggregate pattern signals instead of raw text
                const angles = otherUsersData.map(r => r.creativeIdentity?.hookAngle).filter(Boolean);
                const angleCounts: Record<string, number> = {};
                angles.forEach(a => { if (a) angleCounts[a] = (angleCounts[a] || 0) + 1; });
                const topAngles = Object.entries(angleCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

                const templates = otherUsersData.map(r => r.creativeIdentity?.contractTemplateId).filter(Boolean);
                const templateCounts: Record<string, number> = {};
                templates.forEach(t => { if (t) templateCounts[t] = (templateCounts[t] || 0) + 1; });
                const topTemplates = Object.entries(templateCounts).sort((a, b) => b[1] - a[1]).slice(0, 2);

                const patterns: string[] = [];
                if (topAngles.length > 0) {
                    patterns.push(`Top-performing hook angles in this niche: ${topAngles.map(([a, c]) => `${a} (${c}x liked)`).join(', ')}`);
                }
                if (topTemplates.length > 0) {
                    patterns.push(`Preferred layout templates: ${topTemplates.map(([t, c]) => `${t.replace(/_/g, ' ')} (${c}x)`).join(', ')}`);
                }
                // Also include safe tone/length signals
                const avgLen = otherUsersData.reduce((s, r) => s + (r.output?.hookText?.length || 0), 0) / otherUsersData.length;
                patterns.push(`Typical hook length: ${avgLen < 30 ? 'short (under 30 chars)' : avgLen < 60 ? 'medium (30-60 chars)' : 'long (60+ chars)'}`);

                if (patterns.length > 0) {
                    contextParts.push(`NICHE INTELLIGENCE (aggregated from ${otherUsersData.length} high-performing creatives):\n${patterns.map(p => `- ${p}`).join('\n')}`);
                }
            }
        }

        if (contextParts.length === 0) return '';

        return `
═══════════════════════════════════════════════════════════════════════════════
PERSONALIZATION INTELLIGENCE (Data-Driven)
═══════════════════════════════════════════════════════════════════════════════
${contextParts.join('\n\n')}
═══════════════════════════════════════════════════════════════════════════════
Use the above to guide creative direction. Match preferences while staying fresh.
═══════════════════════════════════════════════════════════════════════════════
`;
    }

    // ═══ 9. GET FAVORITE IDS ═══
    async getFavoriteIds(userId: string, workspaceId?: string): Promise<Set<string>> {
        try {
            const useWorkspace = !!workspaceId;
            const scopeField = useWorkspace ? 'workspaceId' : 'userId';
            const scopeValue = useWorkspace ? workspaceId! : userId;
            try {
                const q = query(
                    collection(db, 'generations'),
                    where(scopeField, '==', scopeValue),
                    where('feedback.savedToFavorites', '==', true),
                    orderBy('timestamp', 'desc'),
                    limit(200)
                );
                const snap = await getDocs(q);
                return new Set(snap.docs.map(d => d.id));
            } catch (e: unknown) {
                // Only fallback for missing composite index; rethrow other errors
                const code = (e as { code?: string })?.code;
                if (code !== 'failed-precondition') throw e;
                const fallbackQ = query(
                    collection(db, 'generations'),
                    where(scopeField, '==', scopeValue),
                    orderBy('timestamp', 'desc'),
                    limit(200)
                );
                const snap = await getDocs(fallbackQ);
                return new Set(
                    snap.docs
                        .filter(d => {
                            const data = d.data() as { feedback?: { savedToFavorites?: boolean } };
                            return data.feedback?.savedToFavorites === true;
                        })
                        .map(d => d.id)
                );
            }
        } catch (err) {
            console.warn('\u26A0\uFE0F Failed to get favorite IDs:', err);
            return new Set();
        }
    }

    // ═══ 9b. GET FAVORITE STATUS (per-record) ═══
    // Authoritative tri-state check for a single generation's savedToFavorites flag.
    // Returns true / false for authoritative reads, null for transient failures
    // (network, permission, etc.) so callers can distinguish "confirmed not
    // favorited" from "don't know — keep last-known state". Missing docs return
    // false (authoritative: the record can't be favorited if it doesn't exist).
    async getFavoriteStatus(generationId: string): Promise<boolean | null> {
        if (!generationId) return false;
        try {
            const ref = doc(db, 'generations', generationId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return false;
            return (snap.data() as { feedback?: { savedToFavorites?: boolean } })
                .feedback?.savedToFavorites === true;
        } catch (err) {
            console.warn('getFavoriteStatus failed for', generationId, err);
            return null;
        }
    }

    // ═══ 10. UPDATE FAVORITE RECORD ═══
    // Accepts any combination of top-level sections (output / input / metadata /
    // creativeIdentity) and replaces each provided section wholesale on the
    // target record. Used by the favorite Update flow to fully synchronize a
    // saved favorite with the contents of a freshly-generated record, not just
    // the output. Excludes feedback / userId / workspaceId / timestamp — those
    // are immutable properties of the favorite record itself.
    async updateFavoriteRecord(
        generationId: string,
        patch: Partial<Pick<GenerationRecord, 'input' | 'output' | 'metadata' | 'creativeIdentity'>>
    ): Promise<void> {
        if (!generationId) throw new Error('generationId required');
        const updates: Record<string, any> = {};
        if (patch.output !== undefined) updates.output = patch.output;
        if (patch.input !== undefined) updates.input = patch.input;
        if (patch.metadata !== undefined) updates.metadata = patch.metadata;
        if (patch.creativeIdentity !== undefined) updates.creativeIdentity = patch.creativeIdentity;
        if (Object.keys(updates).length === 0) throw new Error('No fields provided for update');
        try {
            const ref = doc(db, 'generations', generationId);
            await updateDoc(ref, updates);
        } catch (err) {
            console.warn('Failed to update favorite record:', generationId, err);
            throw err;
        }
    }

    // ═══ 11. BUILD REGENERATION CONTEXT (for thumbs-down → retry) ═══
    buildRegenerationContext(
        originalOutput: string,
        tags: NegativeFeedbackTag[],
        freeText: string
    ): string {
        const tagDescriptions: Record<string, string> = {
            'too_generic': 'Be BOLDER, more specific, more provocative.',
            'wrong_tone': 'Take a completely different tonal approach.',
            'not_relevant': 'Re-read the avatar and address their SPECIFIC pain.',
            'design_off': 'Take a completely different visual approach.',
            'copy_weak': 'Use stronger emotional triggers and harder-hitting angles.',
            'too_long': 'Be more concise — every word must earn its place.',
            'too_short': 'Add more substance, detail, and emotional depth.',
        };

        const reasons = tags.map(t => tagDescriptions[t] || t);

        return `
⚠️ REGENERATION — USER REJECTED PREVIOUS OUTPUT
REJECTED: ${originalOutput.substring(0, 800)}
REASONS: ${reasons.join(' | ')}
${freeText ? `USER NOTE: "${freeText}"` : ''}
Generate a COMPLETELY DIFFERENT creative direction. Do NOT reuse any phrases from the rejected version.`;
    }
}

export const feedbackService = new FeedbackService();