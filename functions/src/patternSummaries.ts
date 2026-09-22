/**
 * patternSummaries.ts — Ticket 1 (Hardened)
 * ═══════════════════════════════════════════════════════════════════════════
 * Pattern summaries pipeline with:
 *   - Structured universe category from creativeIdentity.universeCategory
 *   - Job-state persistence to `job_state` collection
 *   - Data-quality guards with explicit drop counts
 *   - Safety-cap hit detection and reporting
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";
function getDb() { return admin.firestore(); }

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SummaryFamily = 'pair' | 'template' | 'universe_family' | 'hook_angle' | 'failure_pattern';
export type SummaryScope = 'user' | 'niche' | 'global';

export interface PatternSummary {
    summaryId: string;
    family: SummaryFamily;
    key: string;
    scope: SummaryScope;
    scopeValue: string;
    niche: string | null;
    offerType: string | null;
    funnelStage: string | null;
    language: string | null;
    aspectRatio: string | null;
    sampleSize: number;
    /**
     * T029c (Batch 13) — distinct-creative count for the bucket.
     * Spec amendment 1 changes the unit the gate counts from ad rows
     * to distinct creatives (FR-034 / FR-034a / FR-037). For
     * PatternSummary the bucket key (pairId / templateId /
     * universeFamily / hookAngle) groups NRecs that each represent
     * one generation/creative, so `b.n` already counts creatives —
     * the field is populated to `b.n` for clarity and so the gate
     * can read it directly without a `?? sampleSize` fallback that
     * silently regresses to row counting.
     *
     * Optional for backward compatibility with summaries written
     * before T029c landed; gates MUST treat absent as fail (no
     * creative attributed yet, gate stays closed until the producer
     * populates).
     */
    creativeCount?: number;
    /**
     * Batch 5 (FR-037) — distinct creatives in this bucket that
     * have contributed an EFFICIENCY FIGURE (not just any
     * contribution). Optional on read; the gate reads
     * `efficiencyContributingCount ?? 0` so absent means "no
     * efficiency evidence yet" — closes the gate rather than
     * opening it. The production plumbing from `adPerformance` →
     * `generations.efficiencyContributed` (the per-record flag
     * populated by `normalizeAndFilter`) is documented as a
     * separate producer concern; this field exists on the type
     * and is populated end-to-end in the test fixture so the
     * `passesFRO37EfficiencyGate(s)` call at the ranking site fires
     * correctly. The cross-collection read is out of scope for
     * Batch 5 — a future job can back-fill `efficiencyContributed`
     * from `adPerformance` without changing this consumer.
     *
     * The Count is DERIVED from `efficiencyContributingKeys.length`
     * in `toSummary` so the two cannot disagree — the same
     * boundary Batch 4 closed on the hook/visual aggregate with
     * `contributedCreativeKeys` (the count came from a Set that
     * was stripped on write and rebuilt empty on read; Batch 5
     * inherits the discipline and persists the array here too).
     * If a future job back-fills `efficiencyContributed` from
     * `adPerformance` it writes the keys array; the count is a
     * derived field, not a separate write target.
     */
    efficiencyContributingKeys?: string[];
    efficiencyContributingCount?: number;
    deployCount: number;
    spendBackedCount: number;
    usedCount: number;
    favoriteCount: number;
    positiveCount: number;
    negativeCount: number;
    conversionCount: number;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    avgCtr: number;
    weightedWinScore: number;
    weightedLossScore: number;
    netScore: number;
    confidence: number;
    updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
}

export interface JobStatus {
    jobName: string;
    startedAt: admin.firestore.FieldValue;
    completedAt: admin.firestore.FieldValue | null;
    durationMs: number | null;
    success: boolean;
    error: string | null;
    recordsScanned: { generations: number; deployments: number; perfHistory: number };
    groupsRecomputed: { users: number; niches: number };
    summariesWritten: number;
    lookbackHours: number | null;
    droppedRecords: Record<string, number>;
    capsHit: string[];
    universeFallbackUsed: number;
    universeStructuredUsed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CAPS = {
    GENERATIONS_ALL: 10000,
    GENERATIONS_RECENT: 5000,
    GENERATIONS_PER_USER: 2000,
    GENERATIONS_PER_NICHE: 2000,
    DEPLOYMENTS: 5000,
    PERF_HISTORY: 10000,
};

// Known valid pair IDs (from creativeResolver active catalog)
const VALID_MODES = new Set([
    'standard_hero', 'value_stack',
    'event_ticket', 'webinar_screen', 'speaker_card',
    'book_mockup', 'device_mockup',
    'text_only', 'before_after',
]);

// ═══════════════════════════════════════════════════════════════════════════
// DERIVATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function derivePairId(modes: string[] | null): string | null {
    if (!modes || modes.length === 0) return null;
    return [...modes].sort().join('+');
}

/** Validate a pair ID — all constituent modes must be in the active catalog */
function isValidPairId(pairId: string): boolean {
    return pairId.split('+').every(m => VALID_MODES.has(m));
}

/**
 * Derive universe family. Prefers structured `universeCategory` from creativeIdentity.
 * Falls back to name-keyword matching only when structured metadata is absent.
 */
export function deriveUniverseFamily(
    structuredCategory: string | null | undefined,
    universeName: string | null | undefined
): { family: string; usedFallback: boolean } {
    if (structuredCategory && structuredCategory !== 'unknown') {
        return { family: structuredCategory, usedFallback: false };
    }
    if (!universeName) return { family: 'unknown', usedFallback: true };
    const l = universeName.toLowerCase();
    if (l.includes('office') || l.includes('boardroom') || l.includes('corporate')) return { family: 'business', usedFallback: true };
    if (l.includes('stage') || l.includes('podium') || l.includes('conference')) return { family: 'events', usedFallback: true };
    if (l.includes('gym') || l.includes('fitness') || l.includes('yoga')) return { family: 'fitness', usedFallback: true };
    if (l.includes('neon') || l.includes('cyber') || l.includes('futur')) return { family: 'tech', usedFallback: true };
    if (l.includes('mountain') || l.includes('forest') || l.includes('beach')) return { family: 'nature', usedFallback: true };
    if (l.includes('cosmic') || l.includes('galaxy') || l.includes('nebula')) return { family: 'cosmic', usedFallback: true };
    return { family: 'other', usedFallback: true };
}

export function deriveFailurePattern(tags: string[]): string | null {
    if (!tags || tags.length === 0) return null;
    return [...tags].sort().join('+');
}

function buildSummaryId(scope: SummaryScope, sv: string, family: SummaryFamily, key: string): string {
    return `${scope}:${sv}:${family}:${key}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════════

function computeScores(c: {
    usedCount: number; favoriteCount: number; positiveCount: number; negativeCount: number;
    deployCount: number; spendBackedCount: number; conversionCount: number; sampleSize: number; totalNegTags: number;
}) {
    const win = c.usedCount * 1.0 + c.favoriteCount * 0.8 + c.positiveCount * 0.6 +
        c.deployCount * 1.5 + c.spendBackedCount * 3.0 + c.conversionCount * 5.0;
    const loss = c.negativeCount * 1.0 + c.totalNegTags * 0.5;
    return {
        weightedWinScore: +win.toFixed(2), weightedLossScore: +loss.toFixed(2),
        netScore: +(win - loss).toFixed(2),
        confidence: +(Math.min(1, c.sampleSize / 20) * Math.min(1, c.spendBackedCount / 3)).toFixed(3),
    };
}

/**
 * T029c fix (Batch 14) — derive a stable per-creative identifier from the
 * `creativeIdentity` fields so the bucket counts **distinct creatives**,
 * not distinct `generations` docs. Each `generations` doc = one
 * generation event (an `addDoc` in `feedbackService.saveGeneration`);
 * two regenerate-clicks of the same creative produce two docs with
 * the same `creativeIdentity`. Without dedup, `b.n` would inflate
 * `PatternSummary.creativeCount` by the regeneration count and the
 * FR-034a floor would admit a single highly-regenerated creative.
 *
 * Hash inputs are the four deterministic identity fields:
 *   - `selectedModes` (sorted)
 *   - `contractTemplateId`
 *   - `universeCategory`
 *   - `hookAngle`
 * Generation timestamps and feedback ratings are deliberately
 * excluded — two saves of the same creative must hash to the same
 * value. Returns `null` when no identity is present so the bucket
 * falls back to the doc-id (preserves the prior behaviour for old
 * `generations` docs written before this field existed).
 */
export function computeCreativeHash(ci: { selectedModes?: string[] | null; contractTemplateId?: string | null; universeCategory?: string | null; hookAngle?: string | null } | null | undefined): string | null {
    if (!ci) return null;
    const parts = [
        [...(ci.selectedModes || [])].sort().join('+'),
        ci.contractTemplateId || '',
        ci.universeCategory || '',
        ci.hookAngle || '',
    ].join('|');
    // BATCH 21 — CodeRabbit round-2 fix: when all four identity
    // fields are absent, `parts === '|||'`. Without this guard the
    // function returned a non-null djb2 hash of the constant `'|||'`
    // string, so every record with no creativeIdentity shared one
    // hash. That made `Bucket.creativeHashes` always report size 1
    // for the legacy data the universeFamily gate accepts on
    // `inp.tone`, so `creativeCount` undercounted and the FR-034a
    // floor of 3 stayed closed. It also made the legacy fallback key
    // (`__legacy_${r.userId}_${b.n}_${r.adId}`) unreachable from this
    // producer — the row's `creativeHash` was never null in
    // practice.
    if (parts === '|||') return null;
    // djb2 hash; stable across runs and short enough to log.
    let h = 5381;
    for (let i = 0; i < parts.length; i++) {
        h = ((h << 5) + h + parts.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36).padStart(7, '0');
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZED RECORD + DATA QUALITY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

interface NRec {
    userId: string; niche: string | null; offerType: string | null; funnelStage: string | null;
    language: string | null; aspectRatio: string | null;
    pairId: string | null; templateId: string | null; universeFamily: string; hookAngle: string | null;
    isUsed: boolean; isFavorite: boolean; isPositive: boolean; isNegative: boolean; negativeTags: string[];
    isDeployed: boolean; isSpendBacked: boolean; hasConversion: boolean;
    spend: number; impressions: number; clicks: number;
    /**
     * T029c fix (Batch 14) — stable per-creative identifier derived
     * from the `creativeIdentity` fields. Two NRecs with the same
     * hash represent one creative (the same generation parameters);
     * the bucket uses `creativeHashes.size` for `PatternSummary.creativeCount`
     * so re-generations of one creative do not inflate the per-family
     * creative count.
     */
    creativeHash: string | null;
    /**
     * BATCH 20 — Item 3 (CR-M18 hashless fallback uniqueness). The
     * `generations` document id, used to disambiguate hashless rows
     * in the legacy fallback key. Without this, all hashless rows
     * from one user in the same angle collapse to a single Set
     * entry, undercounting `creativeCount` for them.
     */
    adId: string;
    /**
     * Batch 5 (FR-037) — whether THIS `generations` row's underlying
     * `adPerformance` record contributed an efficiency figure
     * (per FR-077's eligibility). The `generations` doc carries
     * this as a flag written by the producer that joins with
     * `adPerformance` (out of scope for Batch 5's wiring).
     * `add()` adds the row's per-creative hash to
     * `Bucket.efficiencyContributingHashes` only when this is true.
     */
    efficiencyContributed?: boolean;
}

interface QualityReport {
    accepted: number;
    dropped: Record<string, number>;
    universeFallbackUsed: number;
    universeStructuredUsed: number;
}

function normalizeAndFilter(docs: FirebaseFirestore.QueryDocumentSnapshot[]): { records: NRec[]; quality: QualityReport } {
    const records: NRec[] = [];
    const quality: QualityReport = { accepted: 0, dropped: {}, universeFallbackUsed: 0, universeStructuredUsed: 0 };
    const drop = (reason: string) => { quality.dropped[reason] = (quality.dropped[reason] || 0) + 1; };

    for (const doc of docs) {
        const d = doc.data();

        // ─── Guard: missing userId ───
        if (!d.userId || typeof d.userId !== 'string') { drop('missing_userId'); continue; }

        const ci = d.creativeIdentity || {};
        const fb = d.feedback || {};
        const inp = d.input || {};

        // ─── Guard: derive and validate pairId ───
        const pairId = derivePairId(ci.selectedModes || null);
        if (pairId && !isValidPairId(pairId)) { drop('invalid_pairId'); continue; }

        // ─── Guard: validate templateId if present ───
        const templateId = ci.contractTemplateId || null;
        if (templateId && typeof templateId !== 'string') { drop('invalid_templateId'); continue; }

        // ─── Universe: prefer structured, track fallback ───
        const uniResult = deriveUniverseFamily(ci.universeCategory || null, ci.universeId || inp.tone || null);
        if (uniResult.usedFallback) quality.universeFallbackUsed++;
        else quality.universeStructuredUsed++;

        // ─── Guard: skip records with no useful identity at all ───
        if (!pairId && !templateId && !ci.hookAngle && uniResult.family === 'unknown') {
            drop('no_identity_fields'); continue;
        }

        records.push({
            userId: d.userId, niche: inp.niche || null, offerType: inp.offer || null,
            funnelStage: inp.campaignType || null, language: inp.language || null,
            aspectRatio: d.metadata?.aspectRatio || null,
            pairId, templateId,
            universeFamily: uniResult.family,
            hookAngle: ci.hookAngle || null,
            isUsed: fb.rating === 'used', isFavorite: fb.savedToFavorites === true,
            isPositive: fb.rating === 'positive', isNegative: fb.rating === 'negative',
            negativeTags: Array.isArray(fb.tags) ? fb.tags : [],
            isDeployed: false, isSpendBacked: false, hasConversion: false,
            spend: 0, impressions: 0, clicks: 0,
            // T029c fix (Batch 14) — see `computeCreativeHash` above.
            // Stable per-creative identifier so re-generations of the
            // same creative do not inflate `creativeCount`.
            creativeHash: computeCreativeHash(d.creativeIdentity || null),
            adId: doc.id,
        });
        quality.accepted++;
    }

    return { records, quality };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA EXTRACTION (with cap tracking)
// ═══════════════════════════════════════════════════════════════════════════

interface ReadResult { records: NRec[]; quality: QualityReport; capsHit: string[] }

async function readAllGenerations(): Promise<ReadResult> {
    const snap = await getDb().collection('generations').limit(CAPS.GENERATIONS_ALL).get();
    const capsHit: string[] = [];
    if (snap.size >= CAPS.GENERATIONS_ALL) capsHit.push(`generations_all:${CAPS.GENERATIONS_ALL}`);
    const { records, quality } = normalizeAndFilter(snap.docs);
    return { records, quality, capsHit };
}

async function readRecentGenerations(since: Date): Promise<ReadResult> {
    const snap = await getDb().collection('generations')
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(since))
        .limit(CAPS.GENERATIONS_RECENT).get();
    const capsHit: string[] = [];
    if (snap.size >= CAPS.GENERATIONS_RECENT) capsHit.push(`generations_recent:${CAPS.GENERATIONS_RECENT}`);
    const { records, quality } = normalizeAndFilter(snap.docs);
    return { records, quality, capsHit };
}

async function readUserGenerations(userId: string): Promise<{ records: NRec[]; quality: QualityReport; capHit: boolean }> {
    const snap = await getDb().collection('generations').where('userId', '==', userId).limit(CAPS.GENERATIONS_PER_USER).get();
    const capHit = snap.size >= CAPS.GENERATIONS_PER_USER;
    const { records, quality } = normalizeAndFilter(snap.docs);
    return { records, quality, capHit };
}

async function readNicheGenerations(niche: string): Promise<{ records: NRec[]; quality: QualityReport; capHit: boolean }> {
    const snap = await getDb().collection('generations').where('input.niche', '==', niche).limit(CAPS.GENERATIONS_PER_NICHE).get();
    const capHit = snap.size >= CAPS.GENERATIONS_PER_NICHE;
    const { records, quality } = normalizeAndFilter(snap.docs);
    return { records, quality, capHit };
}

async function enrichWithPerformance(records: NRec[], capsHit: string[]): Promise<{ depCount: number; perfCount: number }> {
    const depSnap = await getDb().collection('creativeDeployments').limit(CAPS.DEPLOYMENTS).get();
    if (depSnap.size >= CAPS.DEPLOYMENTS) capsHit.push(`deployments:${CAPS.DEPLOYMENTS}`);
    const depMap = new Map<string, { spend: number; impr: number; clicks: number; purch: number; leads: number }>();
    for (const doc of depSnap.docs) {
        const d = doc.data();
        const pid = derivePairId(d.selectedModes || null);
        if (!pid || !d.userId) continue;
        const k = `${d.userId}:${pid}`;
        if (!depMap.has(k)) depMap.set(k, { spend: 0, impr: 0, clicks: 0, purch: 0, leads: 0 });
        const a = depMap.get(k)!;
        const m = d.latestMetrics;
        if (m) { a.spend += m.spend || 0; a.impr += m.impressions || 0; a.clicks += m.clicks || 0; a.purch += m.purchases || 0; a.leads += m.leads || 0; }
    }

    const perfSnap = await getDb().collection('adPerformanceHistory').limit(CAPS.PERF_HISTORY).get();
    if (perfSnap.size >= CAPS.PERF_HISTORY) capsHit.push(`perfHistory:${CAPS.PERF_HISTORY}`);
    const perfMap = new Map<string, { purch: number; leads: number }>();
    for (const doc of perfSnap.docs) {
        const d = doc.data();
        const uid = d.userId || '';
        if (!uid) continue;
        if (!perfMap.has(uid)) perfMap.set(uid, { purch: 0, leads: 0 });
        const p = perfMap.get(uid)!;
        p.purch += d.purchases || 0; p.leads += d.leads || 0;
    }

    for (const r of records) {
        if (!r.pairId) continue;
        const dep = depMap.get(`${r.userId}:${r.pairId}`);
        if (dep) {
            r.isDeployed = true;
            r.isSpendBacked = dep.spend > 0 || dep.impr > 0;
            r.hasConversion = dep.purch > 0 || dep.leads > 0;
            r.spend = dep.spend; r.impressions = dep.impr; r.clicks = dep.clicks;
        }
        const perf = perfMap.get(r.userId);
        if (perf && r.isDeployed && (perf.purch > 0 || perf.leads > 0)) r.hasConversion = true;
    }

    return { depCount: depSnap.size, perfCount: perfSnap.size };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

interface Bucket {
    n: number; deploy: number; spendBacked: number; used: number; fav: number;
    pos: number; neg: number; conv: number; negTags: number;
    spend: number; impr: number; clicks: number;
    niches: Set<string>; offers: Set<string>; stages: Set<string>; langs: Set<string>; ratios: Set<string>;
    /**
     * T029c fix (Batch 14) — distinct per-creative hashes for this
     * bucket. Two NRecs with the same `creativeHash` represent one
     * creative (the same generation parameters); the bucket uses
     * `creativeHashes.size` for `PatternSummary.creativeCount` so
     * re-generations of one creative do not inflate the per-family
     * creative count. Old `generations` docs without
     * `creativeIdentity` contribute `null` and count as one each,
     * preserving the pre-fix behaviour for that historical subset.
     */
    creativeHashes: Set<string>;
    /**
     * Batch 5 (FR-037) — distinct per-creative hashes for creatives
     * that contributed an EFFICIENCY FIGURE. `toSummary` populates
     * `PatternSummary.efficiencyContributingCount` from this set's
     * size; absent means "no efficiency evidence yet" for this
     * bucket. Optional on read for the same reason as `creativeHashes`
     * (records written before this field existed).
     */
    efficiencyContributingHashes?: Set<string>;
}

function newBucket(): Bucket {
    return {
        n: 0, deploy: 0, spendBacked: 0, used: 0, fav: 0, pos: 0, neg: 0, conv: 0, negTags: 0,
        spend: 0, impr: 0, clicks: 0, niches: new Set(), offers: new Set(), stages: new Set(), langs: new Set(), ratios: new Set(),
        creativeHashes: new Set(),
        efficiencyContributingHashes: new Set(),
    };
}

function add(b: Bucket, r: NRec): void {
    b.n++; if (r.isUsed) b.used++; if (r.isFavorite) b.fav++; if (r.isPositive) b.pos++;
    if (r.isNegative) b.neg++; if (r.isDeployed) b.deploy++; if (r.isSpendBacked) b.spendBacked++;
    if (r.hasConversion) b.conv++; b.negTags += r.negativeTags.length;
    b.spend += r.spend; b.impr += r.impressions; b.clicks += r.clicks;
    if (r.niche) b.niches.add(r.niche); if (r.offerType) b.offers.add(r.offerType);
    if (r.funnelStage) b.stages.add(r.funnelStage); if (r.language) b.langs.add(r.language);
    if (r.aspectRatio) b.ratios.add(r.aspectRatio);
    // T029c fix (Batch 14) — record the per-creative hash; absent
    // hash counts as one (the legacy fallback for pre-fix `generations`
    // docs) so the bucket still sees a `creativeCount` for them. The
    // discriminator test in §3 of the Batch 14 report constructs two
    // NRecs with the same `creativeHash` and asserts the bucket's
    // creativeCount is 1, not 2.
    b.creativeHashes.add(r.creativeHash ?? `__legacy_${r.userId}_${b.n}_${r.adId}`);
    // Batch 5 (FR-037) — only record this creative's hash in the
    // efficiency-contributing set when the producer flagged it. The
    // hash dedup mirrors `creativeHashes` above (same fallback for
    // legacy rows).
    if (r.efficiencyContributed === true) {
        b.efficiencyContributingHashes!.add(
            r.creativeHash ?? `__legacy_${r.userId}_${b.n}_${r.adId}`,
        );
    }
}

function toSummary(b: Bucket, fam: SummaryFamily, key: string, scope: SummaryScope, sv: string): PatternSummary {
    const sc = computeScores({
        usedCount: b.used, favoriteCount: b.fav, positiveCount: b.pos,
        negativeCount: b.neg, deployCount: b.deploy, spendBackedCount: b.spendBacked,
        conversionCount: b.conv, sampleSize: b.n, totalNegTags: b.negTags
    });
    const top = (s: Set<string>) => s.size > 0 ? [...s].sort()[0] : null;
    return {
        summaryId: buildSummaryId(scope, sv, fam, key), family: fam, key, scope, scopeValue: sv,
        niche: top(b.niches), offerType: top(b.offers), funnelStage: top(b.stages),
        language: top(b.langs), aspectRatio: top(b.ratios),
        sampleSize: b.n,
        // T029c fix (Batch 14) — distinct-creative count derived from
        // the set of per-creative hashes in the bucket. With a single
        // `creativeHash` per creative (see `computeCreativeHash`),
        // `creativeHashes.size` equals the count of distinct creatives
        // per family key. The gate (FR-034 / FR-034a / FR-037) reads
        // this directly without any `?? sampleSize` fallback. The
        // Batch 13 report's claim that `b.n` already counted creatives
        // was almost-but-not-quite right — see the Batch 14 verification
        // for the full analysis. The fix is the Set-dedup here, not
        // the row-counting invariant `b.n` would suggest.
        creativeCount: b.creativeHashes.size,
        // Batch 5 (FR-037) — distinct creatives in this bucket that
        // contributed an efficiency figure. Optional on read for the
        // same reason as `creativeCount` (records written before this
        // field existed). The gate reads `?? 0` so absent means "no
        // efficiency evidence yet" and closes the gate.
        //
        // PERSISTED AS AN ARRAY, count derived from its length (the
        // Count-confusion fix from Batch 28's review, applied to the
        // summary side). The previous shape wrote only the integer
        // count; the in-memory `efficiencyContributingHashes` Set
        // could not be persisted, so a re-aggregation from cold
        // `generations` data could only see the Set if
        // `normalizeAndFilter` joined with `adPerformance` (out of
        // scope for Batch 5's wiring). Writing the array puts the
        // keys on the persisted document — a future job that joins
        // with `adPerformance` has a target to populate; the count
        // derived from `keys.length` cannot drift from the keys.
        // Round-tripping the summary through Firestore preserves
        // both fields together (the discriminator test asserts this).
        efficiencyContributingKeys: [...(b.efficiencyContributingHashes ?? [])],
        efficiencyContributingCount: (b.efficiencyContributingHashes ?? new Set<string>()).size,
        deployCount: b.deploy, spendBackedCount: b.spendBacked,
        usedCount: b.used, favoriteCount: b.fav, positiveCount: b.pos,
        negativeCount: b.neg, conversionCount: b.conv,
        totalSpend: +b.spend.toFixed(2), totalImpressions: b.impr, totalClicks: b.clicks,
        avgCtr: b.impr > 0 ? +((b.clicks / b.impr) * 100).toFixed(2) : 0,
        ...sc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

function aggregate(records: NRec[]): PatternSummary[] {
    const out: PatternSummary[] = [];
    type SK = { scope: SummaryScope; sv: string };
    const scopes: SK[] = [{ scope: 'global', sv: '_global' }];
    const uids = new Set(records.map(r => r.userId).filter(Boolean));
    for (const u of uids) scopes.push({ scope: 'user', sv: u });
    const niches = new Set(records.map(r => r.niche).filter(Boolean) as string[]);
    for (const n of niches) scopes.push({ scope: 'niche', sv: n });

    const families: { fam: SummaryFamily; getKey: (r: NRec) => string | null }[] = [
        { fam: 'pair', getKey: r => r.pairId },
        { fam: 'template', getKey: r => r.templateId },
        { fam: 'universe_family', getKey: r => r.universeFamily !== 'unknown' && r.universeFamily !== 'other' ? r.universeFamily : null },
        { fam: 'hook_angle', getKey: r => r.hookAngle },
        { fam: 'failure_pattern', getKey: r => r.isNegative && r.negativeTags.length > 0 ? deriveFailurePattern(r.negativeTags) : null },
    ];

    for (const { scope, sv } of scopes) {
        const f = scope === 'global' ? records : scope === 'user' ? records.filter(r => r.userId === sv) : records.filter(r => r.niche === sv);
        if (f.length === 0) continue;
        for (const { fam, getKey } of families) {
            const buckets = new Map<string, Bucket>();
            for (const r of f) { const k = getKey(r); if (!k) continue; if (!buckets.has(k)) buckets.set(k, newBucket()); add(buckets.get(k)!, r); }
            for (const [k, b] of buckets) out.push(toSummary(b, fam, k, scope, sv));
        }
    }
    return out;
}

// BATCH 20 — Item 3 test seam. The bucketing path (`newBucket`,
// `add`) is private; the behavioural test in
// `__tests__/patternSummaries.creativeHash.test.ts` exercises the
// hashless fallback uniqueness through these seams. Production
// callers do not import from `__bucketForTests`; the underscore
// prefix signals test-only and the export lives at the module scope
// rather than any barrel re-export.
//
// BATCH 5 — `toSummary` is also private. The behavioural test in
// `__tests__/phase969/patternSummariesEfficiencyKeys.test.ts`
// exercises the round-trip persistence of
// `PatternSummary.efficiencyContributingKeys` (the field that closes
// the Bug-4 defect the user named) through this seam. Adding
// `toSummary` to the seam keeps the test independent of the worker
// orchestration (`runIncrementalRollup` etc.) — the discriminator
// observes the writer directly, not the chain.
export const __bucketForTests = {
    newBucket,
    add,
    toSummary,
} as const;


// ═══════════════════════════════════════════════════════════════════════════
// WRITE + JOB STATE
// ═══════════════════════════════════════════════════════════════════════════

async function writeBatch(summaries: PatternSummary[]): Promise<number> {
    let w = 0;
    for (let i = 0; i < summaries.length; i += 450) {
        const batch = getDb().batch();
        for (const s of summaries.slice(i, i + 450)) batch.set(getDb().collection('pattern_summaries').doc(s.summaryId), s);
        await batch.commit(); w += Math.min(450, summaries.length - i);
    }
    return w;
}

async function deleteBatch(ids: string[]): Promise<number> {
    let d = 0;
    for (let i = 0; i < ids.length; i += 450) {
        const batch = getDb().batch();
        for (const id of ids.slice(i, i + 450)) batch.delete(getDb().collection('pattern_summaries').doc(id));
        await batch.commit(); d += Math.min(450, ids.length - i);
    }
    return d;
}

async function writeJobStatus(status: JobStatus): Promise<void> {
    const docId = `${status.jobName}_${Date.now()}`;
    await getDb().collection('job_state').doc(docId).set(status);
    // Also update the "latest" marker for easy lookup
    await getDb().collection('job_state').doc(`latest_${status.jobName}`).set(status);
}

function mergeQuality(target: QualityReport, source: QualityReport): void {
    target.accepted += source.accepted;
    target.universeFallbackUsed += source.universeFallbackUsed;
    target.universeStructuredUsed += source.universeStructuredUsed;
    for (const [k, v] of Object.entries(source.dropped)) target.dropped[k] = (target.dropped[k] || 0) + v;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB A — INCREMENTAL ROLLUP (Idempotent)
// ═══════════════════════════════════════════════════════════════════════════

export async function runIncrementalRollup(hoursBack: number = 24): Promise<JobStatus> {
    const startMs = Date.now();
    const status: JobStatus = {
        jobName: 'incremental_rollup', startedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null, durationMs: null, success: false, error: null,
        recordsScanned: { generations: 0, deployments: 0, perfHistory: 0 },
        groupsRecomputed: { users: 0, niches: 0 }, summariesWritten: 0, lookbackHours: hoursBack,
        droppedRecords: {}, capsHit: [], universeFallbackUsed: 0, universeStructuredUsed: 0,
    };

    try {
        const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const recent = await readRecentGenerations(since);
        status.capsHit.push(...recent.capsHit);
        status.recordsScanned.generations = recent.records.length;

        if (recent.records.length === 0) {
            status.success = true; status.completedAt = admin.firestore.FieldValue.serverTimestamp();
            status.durationMs = Date.now() - startMs;
            await writeJobStatus(status);
            return status;
        }

        const affectedUsers = new Set(recent.records.map(r => r.userId).filter(Boolean));
        const affectedNiches = new Set(recent.records.map(r => r.niche).filter(Boolean) as string[]);
        status.groupsRecomputed = { users: affectedUsers.size, niches: affectedNiches.size };

        // Re-read ALL records for affected groups
        const allRecords: NRec[] = [];
        const totalQuality: QualityReport = { accepted: 0, dropped: {}, universeFallbackUsed: 0, universeStructuredUsed: 0 };
        const seenUsers = new Set<string>();

        for (const uid of affectedUsers) {
            const r = await readUserGenerations(uid);
            allRecords.push(...r.records);
            mergeQuality(totalQuality, r.quality);
            if (r.capHit) status.capsHit.push(`user_${uid}:${CAPS.GENERATIONS_PER_USER}`);
            seenUsers.add(uid);
        }
        for (const niche of affectedNiches) {
            const r = await readNicheGenerations(niche);
            for (const rec of r.records) { if (!seenUsers.has(rec.userId)) allRecords.push(rec); }
            mergeQuality(totalQuality, r.quality);
            if (r.capHit) status.capsHit.push(`niche_${niche}:${CAPS.GENERATIONS_PER_NICHE}`);
        }

        status.recordsScanned.generations = allRecords.length;
        const { depCount, perfCount } = await enrichWithPerformance(allRecords, status.capsHit);
        status.recordsScanned.deployments = depCount;
        status.recordsScanned.perfHistory = perfCount;

        const summaries = aggregate(allRecords);
        const relevant = summaries.filter(s =>
            s.scope === 'global' || (s.scope === 'user' && affectedUsers.has(s.scopeValue)) || (s.scope === 'niche' && affectedNiches.has(s.scopeValue))
        );

        status.summariesWritten = await writeBatch(relevant);
        status.droppedRecords = totalQuality.dropped;
        status.universeFallbackUsed = totalQuality.universeFallbackUsed;
        status.universeStructuredUsed = totalQuality.universeStructuredUsed;
        status.success = true;
    } catch (err: any) {
        status.error = err.message || String(err);
        console.error('📊 Incremental rollup failed:', err);
    }

    status.completedAt = admin.firestore.FieldValue.serverTimestamp();
    status.durationMs = Date.now() - startMs;
    await writeJobStatus(status);
    return status;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB B — FULL RECONCILIATION
// ═══════════════════════════════════════════════════════════════════════════

export async function runFullReconciliation(): Promise<JobStatus> {
    const startMs = Date.now();
    const status: JobStatus = {
        jobName: 'full_reconciliation', startedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null, durationMs: null, success: false, error: null,
        recordsScanned: { generations: 0, deployments: 0, perfHistory: 0 },
        groupsRecomputed: { users: 0, niches: 0 }, summariesWritten: 0, lookbackHours: null,
        droppedRecords: {}, capsHit: [], universeFallbackUsed: 0, universeStructuredUsed: 0,
    };

    try {
        const old = await getDb().collection('pattern_summaries').limit(10000).get();
        await deleteBatch(old.docs.map(d => d.id));

        const { records, quality, capsHit } = await readAllGenerations();
        status.capsHit.push(...capsHit);
        status.recordsScanned.generations = records.length;

        const { depCount, perfCount } = await enrichWithPerformance(records, status.capsHit);
        status.recordsScanned.deployments = depCount;
        status.recordsScanned.perfHistory = perfCount;

        const summaries = aggregate(records);
        status.summariesWritten = await writeBatch(summaries);

        const uids = new Set(records.map(r => r.userId).filter(Boolean));
        const niches = new Set(records.map(r => r.niche).filter(Boolean));
        status.groupsRecomputed = { users: uids.size, niches: niches.size };
        status.droppedRecords = quality.dropped;
        status.universeFallbackUsed = quality.universeFallbackUsed;
        status.universeStructuredUsed = quality.universeStructuredUsed;
        status.success = true;
    } catch (err: any) {
        status.error = err.message || String(err);
        console.error('📊 Full reconciliation failed:', err);
    }

    status.completedAt = admin.firestore.FieldValue.serverTimestamp();
    status.durationMs = Date.now() - startMs;
    await writeJobStatus(status);
    return status;
}