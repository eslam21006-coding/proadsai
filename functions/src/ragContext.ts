// functions/src/ragContext.ts — Phase 14 Layer 7a RAG context builder
// ═══════════════════════════════════════════════════════════
// PURE module. Builds a structured "performance context" object
// suitable for injection into the AI generation prompts. The pure
// helper is fed by the caller (the orchestrator in `generators.ts`)
// after Firestore reads — the caller owns side effects, this module
// owns the transformation rules.
//
// Activation gate (spec §9 — RAG injection):
//   - sampleSize uses the MAXIMUM of hook-conversion-count and
//     visual-conversion-count (not the sum — the same creative
//     contributes to both bucket counts so summing would double-
//     count and let the gate trip earlier than intended). The
//     "10+ matched conversion ads" gate fires when EITHER source
//     alone reports 10+ conversion-matched creatives.
//   - Below the gate → insufficient: true, promptBlock: '' (empty).
//     Generation proceeds byte-for-byte identical to before (fail-open
//     at the prompt-injection boundary).
//
// Top performers (hookInsights.topPerformers):
//   - top 3 angles by conversion avgLinkCtr (descending).
//
// Avoid (hookInsights.avoid):
//   - bottom 3 angles WHERE the angle has >= 3 conversion ads AND
//     avgLinkCtr <= 75% of the account average. Below 3 ads ⇒
//     suppressed (data gate; same as the icon gate).
//
// Visual mirror (visualInsights.topPerformers / avoid): same shape
// but keyed on patternKey; the description is a short label like
// "Heritage + Bold + Dubai" the caller can supply when reading the
// pattern doc (default is the patternKey itself). The `avoid` mirror
// now surfaces each pattern's `worstVerdictCount` (the same field
// the hook avoid already exposes) so the model can see "this
// pattern is KILLING it — N 🔴 verdicts" not just an empty count.
//
// selectedAngleRank (informational for downstream surfaces):
//   - 'top'     = the selected angle is the #1 by conversion avgLinkCtr
//   - 'good'    = avgLinkCtr >= 75% of account average
//   - 'weak'    = avgLinkCtr <  75% of account average AND has >= 3 ads
//   - 'unknown' = the selected angle has no aggregate doc
//   - undefined = no hookAngle provided
//
// promptBlock content:
//   - Always includes top angle names and avoid angle names.
//   - Always includes the conservative "inform — but not rigidly
//     copy" line. Hook-angle names are passed in as raw ids; the
//     downstream UI maps them to Arabic labels at the surface level
//     (this module never injects user-facing Arabic strings — they
//     are picked at the call site so the prompt stays in the
//     canonical English angle-id vocabulary).
//   - NEVER contains numeric metric values (CTR/CPA/CPM numbers /
//     percentages / dollar amounts). The model receives pattern
//     names and qualitative guidance only.
// ═══════════════════════════════════════════════════════════

import type {
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "./learningAggregates.js";
import { getDb } from "./firestoreClient.js";

// ─── Public types ─────────────────────────────────────────────

export interface RAGContextInput {
    userId: string;
    workspaceId: string;
    accountId: string;
    hookAngle?: string;
    /** Pattern description overrides keyed by patternKey — lets the
     *  caller surface a human-readable label like "Heritage + Bold +
     *  Dubai" instead of the raw hash. Optional. */
    visualPatternDescriptions?: Record<string, string>;
    /** 90-day account average Link CTR (decimal percentage, e.g.
     *  1.0 = 1.0%). The 75% threshold for the 🔥/⚠️ split and the
     *  avoid rule is derived from this value. */
    accountAvgLinkCtr: number;
    hookAggs: ReadonlyArray<HookPerformanceAggregate>;
    visualAggs: ReadonlyArray<VisualPerformanceAggregate>;
}

export interface RAGContext {
    insufficient: boolean;
    sampleSize: number;
    hookInsights: {
        topPerformers: Array<{
            angleKey: string;
            angleName: string;
            avgLinkCtr: number;
            winCount: number;
        }>;
        avoid: Array<{
            angleKey: string;
            angleName: string;
            avgLinkCtr: number;
            loseCount: number;
        }>;
        selectedAngleRank?: "top" | "good" | "weak" | "unknown";
    };
    visualInsights: {
        topPerformers: Array<{
            patternKey: string;
            description: string;
            avgLinkCtr: number;
            winCount: number;
        }>;
        avoid: Array<{
            patternKey: string;
            description: string;
            avgLinkCtr: number;
            loseCount: number;
        }>;
    };
    /** Pre-formatted hook prompt block (natural-language summary
     *  of the user's hook-angle history). */
    hookBlock: string;
    /** Pre-formatted visual/build-plan prompt block. */
    visualBlock: string;
    /** Pre-formatted caption prompt block (single sentence). */
    captionBlock: string;
    /** Combined narrative block — kept for legacy / general uses. */
    promptBlock: string;
}

// ─── Constants ────────────────────────────────────────────────

export const RAG_MIN_SAMPLE_SIZE = 10;
const AVOID_COUNT = 3;
const TOP_PERFORMER_COUNT = 3;
const AVOID_MIN_ADS = 3;
const AVOID_THRESHOLD_RATIO = 0.75; // ≤ 75% of account average triggers "avoid"

// ─── Pure helpers ─────────────────────────────────────────────

interface RankedHook {
    angleKey: string;
    avgLinkCtr: number;
    winCount: number;
    loseCount: number;
    sampleSize: number;
}

interface RankedVisual {
    patternKey: string;
    avgLinkCtr: number;
    sampleSize: number;
    winCount: number;
    loseCount: number;
}

function rankHooks(
    hookAggs: ReadonlyArray<HookPerformanceAggregate>,
): RankedHook[] {
    return hookAggs
        .filter((a) => a.byObjective.conversion.count > 0)
        .map((a) => ({
            angleKey: a.angleKey,
            avgLinkCtr: a.byObjective.conversion.avgLinkCtr,
            winCount: a.byObjective.conversion.bestVerdictCount,
            loseCount: a.byObjective.conversion.worstVerdictCount,
            sampleSize: a.byObjective.conversion.count,
        }));
}

/**
 * Take the first `n` items from a sorted copy of the input. The
 * comparator fully controls the direction (descending for top-N,
 * ascending for bottom-N) so a single helper covers both use sites
 * without duplicating the slice logic.
 */
function sortSlice<T>(items: ReadonlyArray<T>, n: number, cmp: (a: T, b: T) => number): T[] {
    return [...items].sort(cmp).slice(0, n);
}

function rankSelectedAngle(
    selectedAngle: string | undefined,
    ranked: ReadonlyArray<RankedHook>,
    accountAvgLinkCtr: number,
): "top" | "good" | "weak" | "unknown" | undefined {
    if (!selectedAngle) return undefined;
    const found = ranked.find((r) => r.angleKey === selectedAngle);
    if (!found) return "unknown";
    if (ranked.length > 0 && ranked[0].angleKey === selectedAngle) return "top";
    // "weak" requires BOTH below-threshold avgLinkCtr AND the data gate
    // (>= 3 ads) — same gate as the avoid-list so the rank label and
    // the structured avoid insight cannot disagree about whether a
    // given angle underperforms.
    const threshold = accountAvgLinkCtr * AVOID_THRESHOLD_RATIO;
    if (found.sampleSize >= AVOID_MIN_ADS && found.avgLinkCtr < threshold) return "weak";
    return "good";
}

// ─── Block builders ───────────────────────────────────────────

function pluralize(n: number, singular: string, plural: string): string {
    return n === 1 ? singular : plural;
}

function buildHookBlockText(
    ranked: ReadonlyArray<RankedHook>,
    avoid: ReadonlyArray<RankedHook>,
    sampleSize: number,
): string {
    const top = ranked.slice(0, TOP_PERFORMER_COUNT);
    if (top.length === 0) return "";
    const topNames = top.map((r) => r.angleKey);
    const strongest = topNames[0];
    const secondary = topNames.slice(1).join(", ");
    const topPhrase = top.length === 1
        ? strongest
        : `${strongest}${secondary ? ` (followed by ${secondary})` : ""}`;
    const avoidPhrase = avoid.length > 0
        ? ` Avoid ${avoid.map((r) => r.angleKey).join(", ")} which consistently underperform in this account.`
        : "";
    return (
        `Based on this user's own ad account data (${sampleSize} matched ${pluralize(sampleSize, "creative", "creatives")}): ` +
        `Their top-performing hook angles are ${topPhrase}.` +
        avoidPhrase +
        " Use this to inform — but not rigidly copy — what you generate. The user's history suggests patterns, not rules."
    );
}

function buildVisualBlockText(
    visualRanked: ReadonlyArray<RankedVisual>,
    visualPatternDescriptions: Record<string, string> | undefined,
    accountAvgLinkCtr: number,
): string {
    if (visualRanked.length === 0) return "";
    const top = sortSlice(visualRanked, TOP_PERFORMER_COUNT, (a, b) => b.avgLinkCtr - a.avgLinkCtr);
    const threshold = accountAvgLinkCtr * AVOID_THRESHOLD_RATIO;
    const avoid = sortSlice(
        visualRanked.filter((v) => v.sampleSize >= AVOID_MIN_ADS && v.avgLinkCtr <= threshold),
        AVOID_COUNT,
        (a, b) => a.avgLinkCtr - b.avgLinkCtr,
    );
    const fmt = (v: RankedVisual): string => visualPatternDescriptions?.[v.patternKey] ?? v.patternKey;
    const topJoined = top.map(fmt).join(", ");
    const avoidJoined = avoid.map(fmt).join(", ");
    const topPhrase = top.length === 1 ? fmt(top[0]) : topJoined;
    let s = `This user's best-performing visual compositions are ${topPhrase}. Lean toward these patterns while maintaining creative variety.`;
    if (avoidJoined) {
        s += ` Avoid ${avoidJoined} which underperform in this account.`;
    }
    return s;
}

function buildCaptionBlockText(
    ranked: ReadonlyArray<RankedHook>,
    selectedAngle: string | undefined,
): string {
    if (ranked.length === 0) return "";
    const top = ranked[0];
    const targetAngle = selectedAngle && ranked.find((r) => r.angleKey === selectedAngle)
        ? selectedAngle
        : top.angleKey;
    return `This user's ads perform best with ${targetAngle} approaches — keep the caption tone aligned with what resonates with their audience.`;
}

// ─── Public entry point ────────────────────────────────────────

/**
 * Build the user's RAG context from already-loaded Firestore aggregates.
 * Pure — no Firestore calls, no I/O. The caller (`generators.ts`)
 * loads the aggregates and passes them in; this function returns the
 * structured `RAGContext` ready for prompt injection.
 *
 * Activation gate: total conversion-matched sample size must be ≥ 10.
 * Below that → insufficient: true and every prompt block is empty.
 * The injection sites then skip the PERFORMANCE_CONTEXT block entirely
 * (fail-open, byte-identical to the pre-RAG prompt).
 */
export function buildRAGContext(input: RAGContextInput): RAGContext {
    const {
        hookAggs,
        visualAggs,
        hookAngle,
        visualPatternDescriptions,
        accountAvgLinkCtr,
    } = input;

    // sampleSize = MAX of (hook-conversion-count, visual-conversion-count).
    // The two bucket counts derive from the same underlying matched-
    // creative set — a single conversion campaign creative contributes
    // to BOTH the hook aggregate (for its hook angle) and the visual
    // aggregate (for its pattern). Summing them would double-count
    // and let the 10+ gate trip earlier than the spec intends. The
    // MAX of the two is the conservative count of distinct creatives
    // the user has produced.
    const hookConversionCount = hookAggs.reduce(
        (sum, a) => sum + (a.byObjective.conversion.count || 0),
        0,
    );
    const visualConversionCount = visualAggs.reduce(
        (sum, a) => sum + (a.byObjective.conversion.count || 0),
        0,
    );
    const sampleSize = Math.max(hookConversionCount, visualConversionCount);

    const ranked = rankHooks(hookAggs).sort((a, b) => b.avgLinkCtr - a.avgLinkCtr);
    const threshold = accountAvgLinkCtr * AVOID_THRESHOLD_RATIO;
    const avoidRanked = sortSlice(
        ranked.filter((r) => r.sampleSize >= AVOID_MIN_ADS && r.avgLinkCtr <= threshold),
        AVOID_COUNT,
        (a, b) => a.avgLinkCtr - b.avgLinkCtr,
    );

    const selectedAngleRank = rankSelectedAngle(hookAngle, ranked, accountAvgLinkCtr);

    const insufficient = sampleSize < RAG_MIN_SAMPLE_SIZE;

    // When insufficient, the prompt blocks are empty so the prompts stay
    // byte-identical to the pre-RAG build. The structured insights are
    // always computed (so callers can still surface "no data yet" UI),
    // but the test invariant is that empty prompts go together with empty
    // insight arrays when the gate is closed. The dashboard / icon gating
    // surface its own `insufficient` flag rather than reaching in here.
    const topPerformers = insufficient ? [] : sortSlice(ranked, TOP_PERFORMER_COUNT, (a, b) => b.avgLinkCtr - a.avgLinkCtr).map((r) => ({
        angleKey: r.angleKey,
        angleName: r.angleKey,
        avgLinkCtr: r.avgLinkCtr,
        winCount: r.winCount,
    }));

    const avoid = insufficient ? [] : avoidRanked.map((r) => ({
        angleKey: r.angleKey,
        angleName: r.angleKey,
        avgLinkCtr: r.avgLinkCtr,
        loseCount: r.loseCount,
    }));

    // Visual mirror — compute the ranking ONCE and pass it to the
    // block builder so the structured insights and the prompt block
    // can never disagree about which patterns are top / avoid.
    const visualRanked: RankedVisual[] = visualAggs
        .filter((v) => v.byObjective.conversion.count > 0)
        .map((v) => ({
            patternKey: v.patternKey,
            avgLinkCtr: v.byObjective.conversion.avgLinkCtr,
            sampleSize: v.byObjective.conversion.count,
            winCount: v.byObjective.conversion.bestVerdictCount,
            loseCount: v.byObjective.conversion.worstVerdictCount,
        }));
    const visualTop = insufficient ? [] : sortSlice(visualRanked, TOP_PERFORMER_COUNT, (a, b) => b.avgLinkCtr - a.avgLinkCtr);
    const visualAvoid = insufficient ? [] : sortSlice(
        visualRanked.filter((v) => v.sampleSize >= AVOID_MIN_ADS && v.avgLinkCtr <= threshold),
        AVOID_COUNT,
        (a, b) => a.avgLinkCtr - b.avgLinkCtr,
    );
    const descFor = (key: string): string => visualPatternDescriptions?.[key] ?? key;

    const hookBlock = insufficient ? "" : buildHookBlockText(ranked, avoidRanked, sampleSize);
    const visualBlock = insufficient ? "" : buildVisualBlockText(
        visualRanked,
        visualPatternDescriptions,
        accountAvgLinkCtr,
    );
    const captionBlock = insufficient ? "" : buildCaptionBlockText(ranked, hookAngle);
    const promptBlock = (() => {
        if (insufficient) return "";
        const parts: string[] = [];
        if (hookBlock) parts.push(hookBlock);
        if (visualBlock) parts.push(visualBlock);
        return parts.join(" ");
    })();

    return {
        insufficient,
        sampleSize,
        hookInsights: {
            topPerformers,
            avoid,
            selectedAngleRank,
        },
        visualInsights: {
            topPerformers: visualTop.map((v) => ({
                patternKey: v.patternKey,
                description: descFor(v.patternKey),
                avgLinkCtr: v.avgLinkCtr,
                winCount: v.winCount,
            })),
            avoid: visualAvoid.map((v) => ({
                patternKey: v.patternKey,
                description: descFor(v.patternKey),
                avgLinkCtr: v.avgLinkCtr,
                loseCount: v.loseCount,
            })),
        },
        hookBlock,
        visualBlock,
        captionBlock,
        promptBlock,
    };
}

// ─── Firestore loader (used by the gen call sites) ────────────

/**
 * The canonical empty RAG context. Shared between the catch blocks
 * of `getRAGContext` and `loadRAGContextForWorkspace` so the two
 * fail-open paths cannot drift if a new `RAGContext` field is
 * added. Frozen at module load to prevent accidental mutation.
 */
const EMPTY_RAG_CONTEXT: Readonly<RAGContext> = Object.freeze({
    insufficient: true,
    sampleSize: 0,
    hookInsights: Object.freeze({ topPerformers: [], avoid: [] }),
    visualInsights: Object.freeze({ topPerformers: [], avoid: [] }),
    hookBlock: "",
    visualBlock: "",
    captionBlock: "",
    promptBlock: "",
});

/**
 * Resolve the connected Meta ad account for a workspace. Returns
 * `null` when the workspace has no Meta connection or any read fails
 * (fail-open). FR-026: the workspace has at most one connected account.
 *
 * Exported so the Phase 20 `serverGenerateConcepts` orchestrator can
 * share the exact same connection-resolution contract — a future
 * change to how the connected account is stored has to be made in
 * exactly one place.
 */
export async function resolveConnectedAdAccountId(
    userId: string,
    workspaceId: string,
): Promise<{ accountId: string; accountAvgLinkCtr: number } | null> {
    try {
        const db = getDb();
        const wsSnap = await db
            .doc(`users/${userId}/workspaces/${workspaceId}`)
            .get();
        if (!wsSnap.exists) return null;
        const wsData = wsSnap.data() || {};
        const accountId = typeof wsData.metaAdAccountId === "string" && wsData.metaAdAccountId.length > 0
            ? wsData.metaAdAccountId
            : null;
        if (!accountId) return null;
        let accountAvgLinkCtr = 0;
        try {
            const baselinesSnap = await db
                .doc(`users/${userId}/workspaces/${workspaceId}/adAccounts/${accountId}/baselines`)
                .get();
            const b = baselinesSnap?.data() || {};
            const v = b.linkCtr90d;
            if (typeof v === "number" && Number.isFinite(v) && v > 0) accountAvgLinkCtr = v;
        } catch {
            // Non-blocking — fall back to 0 (no comparison threshold).
        }
        return { accountId, accountAvgLinkCtr };
    } catch {
        return null;
    }
}

/**
 * Load the RAG context (per inputs + Firestore aggregates) directly
 * from the workspace-scoped `hookPerformance` and `visualPerformance`
 * collections. The aggregate READS are workspace + account scoped;
 * the conversion bucket is the only bucket consumed (spec §5.6.3).
 *
 * Returns `insufficient: true` when the read fails or sampleSize < 10.
 * Non-throwing — the caller relies on fail-open behavior.
 */
export async function getRAGContext(input: RAGContextInput): Promise<RAGContext> {
    try {
        const db = getDb();
        const wsPath = `users/${input.userId}/workspaces/${input.workspaceId}/adAccounts/${input.accountId}`;
        const [hookSnap, visualSnap, baselinesSnap] = await Promise.all([
            db.collection(`${wsPath}/hookPerformance`).get().catch(() => null),
            db.collection(`${wsPath}/visualPerformance`).get().catch(() => null),
            db.doc(`${wsPath}/baselines`).get().catch(() => null),
        ]);
        const hookAggs: HookPerformanceAggregate[] = hookSnap
            ? hookSnap.docs.map((d) => d.data() as HookPerformanceAggregate)
            : [];
        const visualAggs: VisualPerformanceAggregate[] = visualSnap
            ? visualSnap.docs.map((d) => d.data() as VisualPerformanceAggregate)
            : [];
        const avg = (baselinesSnap?.data()?.linkCtr90d as number | undefined) ?? input.accountAvgLinkCtr;
        return buildRAGContext({
            ...input,
            hookAggs,
            visualAggs,
            accountAvgLinkCtr: typeof avg === "number" && Number.isFinite(avg) ? avg : input.accountAvgLinkCtr,
        });
    } catch (e) {
        console.warn("⚠️ getRAGContext failed (non-blocking, returning insufficient):", e);
        return EMPTY_RAG_CONTEXT;
    }
}

/**
 * One-shot RAG loader for the generation call sites. Resolves the
 * connected Meta account for the workspace, then loads the aggregates
 * and returns the full `RAGContext`. Returns `insufficient: true`
 * when the workspace has no connected Meta account OR any read fails.
 * Non-throwing.
 */
export async function loadRAGContextForWorkspace(
    userId: string,
    workspaceId: string,
    hookAngle?: string,
): Promise<{ ragContext: RAGContext; accountId: string | null }> {
    const empty: { ragContext: RAGContext; accountId: string | null } = {
        accountId: null,
        ragContext: EMPTY_RAG_CONTEXT,
    };
    try {
        const conn = await resolveConnectedAdAccountId(userId, workspaceId);
        if (!conn) return empty;
        const ragContext = await getRAGContext({
            userId,
            workspaceId,
            accountId: conn.accountId,
            hookAngle,
            accountAvgLinkCtr: conn.accountAvgLinkCtr,
            hookAggs: [],
            visualAggs: [],
        });
        return { ragContext, accountId: conn.accountId };
    } catch (e) {
        console.warn("⚠️ loadRAGContextForWorkspace failed (non-blocking):", e);
        return empty;
    }
}

// ─── Wrapped PER-INJECTION POINT helper ───────────────────────

/**
 * Build the final "PERFORMANCE_CONTEXT" block the prompt builders
 * append into the system prompt. Returns "" when RAG is insufficient
 * so the caller can append nothing (no empty placeholder, no
 * PERFORMANCE_CONTEXT wrapper).
 */
export function buildPerformanceContextBlock(ragContext: RAGContext): string {
    if (ragContext.insufficient || !ragContext.promptBlock) return "";
    return `[PERFORMANCE_CONTEXT]\nUse this to inform — but not rigidly copy — what you generate. The user's history suggests patterns, not rules.\n${ragContext.promptBlock}\n[/PERFORMANCE_CONTEXT]`;
}

/**
 * Hook-only injection block. Lighter than the combined
 * `buildPerformanceContextBlock` — used at the hook-generation
 * prompt site.
 */
export function buildHookPerformanceBlock(ragContext: RAGContext): string {
    if (ragContext.insufficient || !ragContext.hookBlock) return "";
    return `[PERFORMANCE_CONTEXT]\nUse this to inform — but not rigidly copy — the hooks you generate. The user's history suggests patterns, not rules.\n${ragContext.hookBlock}\n[/PERFORMANCE_CONTEXT]`;
}

/**
 * Visual-only injection block. Used at the build-plan prompt site.
 */
export function buildVisualPerformanceBlock(ragContext: RAGContext): string {
    if (ragContext.insufficient || !ragContext.visualBlock) return "";
    return `[PERFORMANCE_CONTEXT]\nThis user's best-performing visual compositions are reflected in the patterns above. Lean toward them while maintaining creative variety.\n${ragContext.visualBlock}\n[/PERFORMANCE_CONTEXT]`;
}

/**
 * Caption-only injection block. Single-sentence light touch (spec §9)
 * — kept minimal because copy learning is excluded from v1.
 */
export function buildCaptionPerformanceBlock(ragContext: RAGContext): string {
    if (ragContext.insufficient || !ragContext.captionBlock) return "";
    return `[PERFORMANCE_CONTEXT]\n${ragContext.captionBlock}\n[/PERFORMANCE_CONTEXT]`;
}
