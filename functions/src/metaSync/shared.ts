// functions/src/metaSync/shared.ts — Phase 14 Layer 2 shared sync logic
// ═══════════════════════════════════════════════════════════
// The "run one account sync" body that the dispatcher, the worker, and the
// manual trigger all call. Lives in its own file so the Cloud Functions
// deployment unit is small (no shared state in a module-global) and the
// contract test (T020) can import the same function the callable exports.
//
// STEPS (spec §3.1):
//   1. Load encrypted token, decrypt.
//   2. Validate / refresh (FR-009 — on refresh failure mark needsReauth, stop).
//   3. Fetch hierarchy (campaigns → ad sets → ads).
//   4. Fetch per-ad insights (3 windows).
//   5. Compute account baselines.
//   6. Compute spend_share_pct per ad.
//   7. Classify targeting context (geo + audience).
//   8. Classify campaign objective.
//   9. Image matching (T033 — workspace-scoped).
//  10. Persist adPerformance / baselines / syncSnapshot; prune to last 7.
//  11. Update lastMetaSyncAt + lastSyncStatus.
//  12. Patch the connection doc with the new timestamps.
//
// IDEMPOTENCY (FR-011): every write is keyed by deterministic doc id
// (adId, snapshotId). Re-running with the same data produces the same
// result. The snapshot id is the sync attempt's monotonic timestamp.
//
// PARTIAL FAILURE (FR-010): if some ads fail, store what succeeded; last
// good aggregates remain intact. We collect errors per-ad and surface them
// on the snapshot doc as `status: 'partial'`.
// ═══════════════════════════════════════════════════════════

import { getDb } from "../firestoreClient.js";
import {
    fetchCampaigns,
    fetchAdSets,
    fetchAds,
    fetchAdCreativeImage,
    fetchAdInsights,
    fetchAccountBaselines,
    fetchAdAccountCurrency,
    downloadCreativeImage,
    extractImageUrl,
    type MetaCampaign,
    type MetaAdSet,
    type MetaAd,
    type InsightsTimeWindows,
} from "../metaGraph.js";
import {
    classifyTargeting,
    type GeoTier,
    type AudienceType,
} from "../targetingContext.js";
import {
    classifyCampaignObjective,
    type CampaignObjectiveBucket,
} from "../campaignObjective.js";
import {
    computeHash,
    decideMatch,
    hammingDistance,
    type MatchCandidate,
} from "../perceptualHash.js";
import {
    loadStoredConnection,
    patchStoredConnection,
    type StoredConnection,
} from "../metaConnection.js";
import {
    decryptLegacyToken,
} from "./legacyToken.js";
import {
    evaluateVerdict,
    type AdPerformanceForVerdict,
    type FunnelSettingsForVerdict,
} from "../qararEngine.js";
import { getEffectiveTarget } from "../cpaEconomics.js";
import {
    isSettingsComplete,
    missingRequiredFields,
} from "../funnelSettings.js";
import {
    updateHookAggregates,
    updateVisualAggregates,
    computePatternKey,
    type AdForLearning,
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
} from "../learningAggregates.js";

// ─── Public types ─────────────────────────────────────────────

export interface SyncParams {
    userId: string;
    workspaceId: string;
    accountId: string;
    trigger: "scheduled" | "manual";
    nowMs: number;
}

export interface SyncResult {
    ok: boolean;
    status: "ok" | "partial" | "failed";
    counts: {
        campaigns: number;
        adSets: number;
        ads: number;
        matched: number;
        unmatched: number;
        ambiguous: number;
    };
    errors: string[];
    needsReauth: boolean;
    lastMetaSyncAt: number;
}

// ─── Internal types ────────────────────────────────────────────

interface ImageFingerprintDoc {
    hash: string;
    generationId: string;
    createdAt: number;
}

export type { ImageFingerprintDoc };

interface AdDoc {
    adId: string;
    adName?: string;
    thumbnailUrl?: string;
    generationId: string | null;
    matchType: "auto_hash" | "manual" | null;
    matchDistance: number | null;
    metadataAvailable: boolean;
    geoTier: GeoTier;
    audienceType: AudienceType;
    campaignObjective: CampaignObjectiveBucket;
    campaignObjectiveRaw: string;
    spend3d: number;
    // FIX 2 (dashboard-polish): 7 complete days of spend (Meta `last_7d`
    // preset — excludes today's partial day). Display-only; the Qarar
    // verdict engine still runs on the 3-day rolling window.
    spend7d: number;
    // FIX 4 (dashboard-polish): image vs video creative. Video ads can
    // never match a Pro Ads AI generation, so the dashboard excludes them
    // from the "Ads That Need Linking" list.
    creativeType: "image" | "video" | "unknown";
    spendToday: number;
    impressions3d: number;
    cpa3d: number | null;
    ctrLink: number;
    ctrAll: number;
    conversions3d: number;
    frequency3d: number;
    spendSharePct: number;
    ageDays: number;
    cpm3d: number;
    peak1dCtr: number;
    creativeId: string | null;
    imageHash: string | null;
    // Phase 14 — Layer 4 (Qarar verdict) — set by T041.
    verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";
    ruleCode: string;
    reasonAr: string;
    diagnosisAr: string | null;
    evaluatedAt: number;
    schemaVersion: 1;
}

const SYNC_SNAPSHOT_RETENTION = 7;

// ─── Pure helpers (exported for tests) ────────────────────────

/**
 * Sum 3-day spend across all ads in an ad set.
 */
export function sumSpend3d(perAdInsights: Map<string, InsightsTimeWindows>): Map<string, number> {
    const out = new Map<string, number>();
    for (const [adId, windows] of perAdInsights) {
        const spend3d = windows.threeDayRolling.reduce(
            (acc, r) => acc + parseNum(r.spend),
            0,
        );
        out.set(adId, spend3d);
    }
    return out;
}

/**
 * spend_share_pct = ad.spend3d / adset.spend3d * 100 (returns 0 when adset sum is 0).
 */
export function computeSpendSharePct(adId: string, adSetId: string, perAdSet: Map<string, Map<string, number>>): number {
    const adSpend = perAdSet.get(adSetId)?.get(adId) ?? 0;
    const adSetSum = Array.from(perAdSet.get(adSetId)?.values() ?? []).reduce((a, b) => a + b, 0);
    if (adSetSum <= 0) return 0;
    return (adSpend / adSetSum) * 100;
}

/**
 * FIX 4 (dashboard-polish): classify a creative as image / video / unknown
 * from the fields we now request (`object_type`, `video_id`). A `video_id`
 * or `object_type === "VIDEO"` is a definite video; a still-image object
 * type or the presence of an image/thumbnail URL is treated as an image.
 * Everything else stays "unknown" so legacy/edge-case ads are NOT hidden
 * from the linking list.
 */
export function deriveCreativeType(creative: MetaAd["creative"]): "image" | "video" | "unknown" {
    if (!creative || typeof creative === "string") return "unknown";
    const objectType = typeof creative.object_type === "string" ? creative.object_type.toUpperCase() : "";
    if (objectType === "VIDEO" || (typeof creative.video_id === "string" && creative.video_id.length > 0)) {
        return "video";
    }
    if (objectType === "PHOTO" || objectType === "SHARE" || creative.image_url || creative.thumbnail_url) {
        return "image";
    }
    return "unknown";
}

/**
 * Aggregate the 3-day window into the metrics shape the rest of the pipeline
 * uses. Pure — no I/O — so the contract test (T020) can verify the shape.
 */
export function aggregateAdMetrics(windows: InsightsTimeWindows): {
    spend3d: number;
    spend7d: number;
    spendToday: number;
    impressions3d: number;
    cpa3d: number | null;
    ctrLink: number;
    ctrAll: number;
    conversions3d: number;
    frequency3d: number;
    cpm3d: number;
    peak1dCtr: number;
} {
    const threeDayRows = windows.threeDayRolling.map((r) => ({ ...r }));
    const spend3d = sumField(threeDayRows, "spend");
    // FIX 2 (dashboard-polish): sum spend across the 7 complete days of
    // the `last_7d` daily window (Meta excludes today from that preset, so
    // this is already "last 7 days, complete days only").
    const spend7d = sumField(windows.last7DaysDaily.map((r) => ({ ...r })), "spend");
    const spendToday = sumField(windows.today.map((r) => ({ ...r })), "spend");
    const impressions3d = sumField(threeDayRows, "impressions");
    const clicks3d = sumField(threeDayRows, "clicks");
    const inlineLinkClicks3d = sumField(threeDayRows, "inline_link_clicks");
    const ctr3d = sumField(threeDayRows, "ctr"); // already avg per row
    const cpm3d = sumField(threeDayRows, "cpm");
    const frequency3d = sumField(threeDayRows, "frequency");
    const conversions3d = countConversionActions(threeDayRows);

    // CTR rates — average across the 3-day rows (Meta returns one row per ad
    // when time_range is supplied without time_increment, so this is just
    // the single row).
    const ctrLink = inlineLinkClicks3d > 0 && impressions3d > 0
        ? (inlineLinkClicks3d / impressions3d) * 100
        : (ctr3d / Math.max(1, windows.threeDayRolling.length));

    const ctrAll = clicks3d > 0 && impressions3d > 0
        ? (clicks3d / impressions3d) * 100
        : 0;

    const cpa3d = conversions3d > 0 ? spend3d / conversions3d : null;

    const peak1dCtr = windows.last7DaysDaily.length > 0
        ? Math.max(...windows.last7DaysDaily.map((r) => {
            const ctr = parseNum(r.inline_link_click_ctr);
            return ctr > 0 ? ctr : parseNum(r.ctr);
        }))
        : 0;

    return {
        spend3d,
        spend7d,
        spendToday,
        impressions3d,
        cpa3d,
        ctrLink,
        ctrAll,
        conversions3d,
        frequency3d,
        cpm3d: cpm3d / Math.max(1, windows.threeDayRolling.length),
        peak1dCtr,
    };
}

function sumField(rows: ReadonlyArray<Record<string, unknown>>, field: string): number {
    let acc = 0;
    for (const row of rows) {
        acc += parseNum(row[field]);
    }
    return acc;
}

function parseNum(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

const RESULT_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "lead",
    "omni_complete_registration",
    "complete_registration",
]);

function countConversionActions(rows: ReadonlyArray<Record<string, unknown>>): number {
    let total = 0;
    for (const row of rows) {
        const actions = row.actions;
        if (!Array.isArray(actions)) continue;
        for (const a of actions) {
            if (!a || typeof a !== "object") continue;
            const actionType = (a as { action_type?: string }).action_type;
            if (typeof actionType !== "string") continue;
            if (RESULT_ACTION_TYPES.has(actionType.toLowerCase())) {
                total += parseNum((a as { value?: string | number }).value);
            }
        }
    }
    return total;
}

// ─── Image matching (workspace-scoped, FR-023) ────────────────

/**
 * Read the workspace's fingerprint index. Returns a map of hash → entry.
 * Cross-workspace search is FORBIDDEN — this only reads the workspace's own
 * subcollection (spec §4.2, Edge Case 13, FR-023).
 */
export async function loadWorkspaceFingerprints(uid: string, workspaceId: string): Promise<Map<string, ImageFingerprintDoc>> {
    const out = new Map<string, ImageFingerprintDoc>();
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("imageFingerprints")
        .get();
    for (const doc of snap.docs) {
        const data = doc.data() as Partial<ImageFingerprintDoc>;
        if (typeof data.hash === "string" && typeof data.generationId === "string") {
            out.set(data.hash, {
                hash: data.hash,
                generationId: data.generationId,
                createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            });
        }
    }
    return out;
}

/**
 * Match a single ad's creative image against the workspace's fingerprint
 * index. Implements spec §4.2:
 *   - distance <= threshold → auto_match
 *   - top two candidates within ambiguity margin → ambiguous (unmatched)
 *   - exact tie → most recent wins
 *   - manual link present → never overridden (handled at the caller level)
 */
export async function matchAdCreative(
    creativeImageHash: string,
    fingerprintIndex: Map<string, ImageFingerprintDoc>,
    maxDistance: number,
): Promise<{
    generationId: string | null;
    matchType: "auto_hash" | null;
    matchDistance: number | null;
    ambiguous: boolean;
}> {
    if (fingerprintIndex.size === 0) {
        return { generationId: null, matchType: null, matchDistance: null, ambiguous: false };
    }
    const candidates: MatchCandidate[] = [];
    for (const entry of fingerprintIndex.values()) {
        // NULL SAFETY: `hammingDistance` THROWS on a malformed or
        // wrong-length hash. Without this guard one legacy/truncated
        // fingerprint entry aborts matching for EVERY ad in the account,
        // not just its own comparison. Skip the bad entry instead.
        let dist: number;
        try {
            dist = hammingDistance(creativeImageHash, entry.hash);
        } catch {
            continue;
        }
        candidates.push({
            hash: entry.hash,
            distance: dist,
            createdAt: entry.createdAt,
            generationId: entry.generationId,
        });
    }
    if (candidates.length === 0) {
        return { generationId: null, matchType: null, matchDistance: null, ambiguous: false };
    }
    const decision = decideMatch(candidates, maxDistance);
    if (decision.reason === "auto_match" && decision.candidate) {
        return {
            generationId: decision.candidate.generationId,
            matchType: "auto_hash",
            matchDistance: decision.candidate.distance,
            ambiguous: false,
        };
    }
    if (decision.reason === "ambiguous") {
        return { generationId: null, matchType: null, matchDistance: null, ambiguous: true };
    }
    return { generationId: null, matchType: null, matchDistance: null, ambiguous: false };
}

// ─── Snapshot pruning (spec §3.4) ────────────────────────────

/**
 * Keep only the most recent `SYNC_SNAPSHOT_RETENTION` snapshots. Called
 * after a successful snapshot write. Deletes are non-blocking — Firestore
 * rate limits won't fail the sync.
 */
export async function pruneSnapshots(uid: string, workspaceId: string, accountId: string): Promise<void> {
    const ref = getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("adAccounts").doc(accountId)
        .collection("syncSnapshots");
    const snap = await ref.orderBy("syncedAt", "desc").get();
    if (snap.size <= SYNC_SNAPSHOT_RETENTION) return;
    const stale = snap.docs.slice(SYNC_SNAPSHOT_RETENTION);
    if (stale.length === 0) return;
    const batch = getDb().batch();
    for (const doc of stale) batch.delete(doc.ref);
    await batch.commit().catch((e: unknown) => {
        console.warn(`pruneSnapshots: batch delete failed (non-blocking): ${(e as Error).message}`);
    });
}

// ─── Main sync body ───────────────────────────────────────────

export async function runSyncForAccount(params: SyncParams): Promise<SyncResult> {
    const { userId, workspaceId, accountId, trigger, nowMs } = params;
    const errors: string[] = [];
    let needsReauth = false;

    // 1. Load + decrypt the token.
    const conn = await loadStoredConnection(userId, workspaceId);
    if (!conn) {
        return {
            ok: false,
            status: "failed",
            counts: emptyCounts(),
            errors: ["No Meta connection found for this workspace."],
            needsReauth: false,
            lastMetaSyncAt: nowMs,
        };
    }
    if (conn.accountId !== accountId) {
        return {
            ok: false,
            status: "failed",
            counts: emptyCounts(),
            errors: ["Workspace connection accountId mismatch."],
            needsReauth: conn.needsReauth,
            lastMetaSyncAt: nowMs,
        };
    }

    let accessToken: string;
    try {
        accessToken = await resolveAccessToken(conn);
    } catch (e: unknown) {
        const msg = (e as Error).message;
        // FR-009: token failure → mark needsReauth, do not delete data.
        await patchStoredConnection(userId, workspaceId, {
            needsReauth: true,
            lastSyncStatus: "failed",
            lastMetaSyncAt: nowMs,
        });
        return {
            ok: false,
            status: "failed",
            counts: emptyCounts(),
            errors: [`Token resolution failed: ${msg}`],
            needsReauth: true,
            lastMetaSyncAt: nowMs,
        };
    }

    // 2. Fetch hierarchy.
    let campaigns: MetaCampaign[] = [];
    let adSets: MetaAdSet[] = [];
    let ads: MetaAd[] = [];
    try {
        campaigns = await fetchCampaigns(accessToken, accountId);
    } catch (e: unknown) {
        errors.push(`fetchCampaigns failed: ${(e as Error).message}`);
    }
    try {
        // allSettled preserves partial success — one failed campaign's
        // ad sets don't discard the others (FR-010).
        const adSetResults = await Promise.allSettled(
            campaigns.map((c) => fetchAdSets(accessToken, c.id)),
        );
        for (let i = 0; i < adSetResults.length; i++) {
            const r = adSetResults[i];
            const parentCampaign = campaigns[i];
            if (r.status === "fulfilled") {
                for (const adSet of r.value) {
                    // FIX 3: stamp the parent campaignId so the ad-set →
                    // campaign join works downstream. Meta doesn't always
                    // return `campaign_id` on /{adSetId}/adsets and we
                    // know the parent here.
                    adSet.campaign_id = adSet.campaign_id || parentCampaign.id;
                }
                adSets.push(...r.value);
            } else {
                errors.push(`fetchAdSets failed: ${(r.reason as Error).message}`);
            }
        }
    } catch (e: unknown) {
        errors.push(`fetchAdSets batch failed: ${(e as Error).message}`);
    }
    try {
        // allSettled: one failed ad set's ads don't poison the rest.
        const adResults = await Promise.allSettled(
            adSets.map((s) => fetchAds(accessToken, s.id)),
        );
        for (let i = 0; i < adResults.length; i++) {
            const r = adResults[i];
            const parentAdSet = adSets[i];
            if (r.status === "fulfilled") {
                for (const ad of r.value) {
                    // FIX 3: stamp parent adset_id so downstream joins
                    // work even when Meta omits the field. Without this,
                    // every ad is classified as tier3_egypt_na / broad and
                    // the wrong campaign objective — which kills all
                    // learning (only "conversion" objective feeds it).
                    if (typeof ad.adset_id !== "string" || ad.adset_id.length === 0) {
                        ad.adset_id = parentAdSet.id;
                    }
                }
                ads.push(...r.value);
            } else {
                errors.push(`fetchAds failed: ${(r.reason as Error).message}`);
            }
        }
    } catch (e: unknown) {
        errors.push(`fetchAds batch failed: ${(e as Error).message}`);
    }

    // 3. Fetch insights + 4. baselines (parallel).
    const adInsightsMap = new Map<string, InsightsTimeWindows>();
    let baselines: Awaited<ReturnType<typeof fetchAccountBaselines>> | null = null;
    // FIX 3 (dashboard-polish): the ad account's own currency code, so the
    // dashboard can label spend in AED/SAR/EGP/USD rather than a bare
    // number. Best-effort — a failure here must never break the sync, and
    // we only overwrite the stored code when we actually got one.
    let accountCurrency: string | null = null;
    try {
        const insightsEntries = await Promise.allSettled(
            ads.map(async (ad) => [ad.id, await fetchAdInsights(accessToken, ad.id)] as const),
        );
        for (const result of insightsEntries) {
            if (result.status === "fulfilled") {
                adInsightsMap.set(result.value[0], result.value[1]);
            } else {
                errors.push(`fetchAdInsights failed: ${(result.reason as Error).message}`);
            }
        }
    } catch (e: unknown) {
        errors.push(`fetchAdInsights batch failed: ${(e as Error).message}`);
    }
    try {
        baselines = await fetchAccountBaselines(accessToken, accountId);
    } catch (e: unknown) {
        errors.push(`fetchAccountBaselines failed: ${(e as Error).message}`);
    }
    try {
        accountCurrency = await fetchAdAccountCurrency(accessToken, accountId);
    } catch (e: unknown) {
        errors.push(`fetchAdAccountCurrency failed: ${(e as Error).message}`);
    }

    // Phase 14 — Layer 4 (T041): load the per-account funnel settings once
    // per sync. The Qarar verdict engine reads `effectiveTarget` from these
    // (effectiveTargetCPA for paid funnels, effectiveTargetCPL for free). If
    // the settings doc is missing or has no derived targets, the engine
    // returns ⏳ with reason "إعدادات مسار المبيعات غير مكتملة".
    //
    // Phase 968 — T037 (FR-042, contracts/funnelSettings.md §6): when the
    // doc exists but is incomplete, emit ONE structured log line per
    // account per sync naming workspace, account, funnel type, and
    // missing fields. Constitution VI/VII: the gate must be auditable.
    // One line per account (NOT per ad) — keeps this from becoming log
    // spam across a large sync.
    let funnelSettings: FunnelSettingsForVerdict | null = null;
    let settingsIncompleteLogged = false;
    try {
        const settingsRef = getDb()
            .collection("users").doc(userId)
            .collection("workspaces").doc(workspaceId)
            .collection("adAccounts").doc(accountId)
            .collection("settings").doc("current");
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data() as Record<string, unknown>;
            if (data && typeof data.derived === "object" && data.derived !== null) {
                funnelSettings = { derived: data.derived as FunnelSettingsForVerdict["derived"] };

                // FR-042 / FR-049: emit the gate log when the stored
                // settings doc is incomplete. Single canonical
                // completeness predicate from funnelSettings.ts —
                // FR-050. Includes pre-phase docs (which are
                // incomplete by definition) and partially-saved new
                // records. The owner sees the badge in the UI; the
                // operator sees this line in the logs.
                const missing = missingRequiredFields(data);
                if (missing.length > 0) {
                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
                    console.warn(
                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[${missing.join(",")}]`,
                    );
                    settingsIncompleteLogged = true;
                }
                // Settings may also be incomplete even when the doc
                // carries every required field — for instance, a stale
                // doc persisted before the commissionRate/marginKept
                // fields existed. The `complete` flag from
                // `getFunnelSettings` is the authoritative signal; for
                // the sync path, `isSettingsComplete` covers both
                // cases (missing field OR null value).
                if (!isSettingsComplete(data) && !settingsIncompleteLogged) {
                    // Defensive — should be unreachable given the
                    // `missing.length > 0` check above, but kept so
                    // future drift doesn't silently drop the log.
                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
                    console.warn(
                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[unknown]`,
                    );
                }
            }
        }
    } catch (e: unknown) {
        errors.push(`load funnel settings failed: ${(e as Error).message}`);
    }

    // Phase 14 — Layer 4b (T044, wired in a later step): batch-load
    // matched-generation metadata for all matched ads so the learning
    // aggregates have what they need. The map is keyed by generationId.
    const matchedGenIds = new Set<string>();
    // (Populated in the ad loop below; we just need the set up here.)
    void matchedGenIds;

    // 5. spend_share_pct per ad within its ad set.
    const adSetIndex = new Map<string, MetaAdSet>();
    for (const s of adSets) adSetIndex.set(s.id, s);
    const adIndex = new Map<string, MetaAd>();
    for (const a of ads) adIndex.set(a.id, a);

    const adSetTotals = new Map<string, number>();
    for (const ad of ads) {
        const windows = adInsightsMap.get(ad.id);
        if (!windows) continue;
        const spend3d = windows.threeDayRolling.reduce((acc, r) => acc + parseNum(r.spend), 0);
        adSetTotals.set(ad.adset_id || "", (adSetTotals.get(ad.adset_id || "") || 0) + spend3d);
    }
    const perAdSetSpend = new Map<string, Map<string, number>>();
    // Phase 14 — Layer 4 (K5): per-ad-set total conversions (3-day
    // rolling). Used to compute the ad-set CPA and derive
    // `adSetHittingTarget` for the K5 starved-ad matrix. Without this
    // rollup, K5_weak can never fire in production.
    const perAdSetConversions = new Map<string, number>();
    for (const ad of ads) {
        const windows = adInsightsMap.get(ad.id);
        if (!windows) continue;
        const spend3d = windows.threeDayRolling.reduce((acc, r) => acc + parseNum(r.spend), 0);
        const conversions3d = windows.threeDayRolling.reduce(
            (acc, r) => acc + (r.actions || [])
                .filter((a) => /^(purchase|omni_purchase|offsite_conversion\.fb_pixel_purchase|lead|omni_complete_registration|complete_registration)$/i.test(a.action_type))
                .reduce((a2, a) => a2 + parseNum(a.value), 0),
            0,
        );
        const setId = ad.adset_id || "";
        if (!perAdSetSpend.has(setId)) perAdSetSpend.set(setId, new Map());
        perAdSetSpend.get(setId)!.set(ad.id, spend3d);
        perAdSetConversions.set(setId, (perAdSetConversions.get(setId) || 0) + conversions3d);
    }

    // 6+7. Targeting + campaign objective classification (per ad).
    const adSetById = new Map<string, MetaAdSet>();
    for (const s of adSets) adSetById.set(s.id, s);
    const campaignById = new Map<string, MetaCampaign>();
    for (const c of campaigns) campaignById.set(c.id, c);

    // 8. Image matching — load workspace fingerprint index, then for each ad
    //    that has a creative image URL, download + hash + match.
    const fingerprintIndex = await loadWorkspaceFingerprints(userId, workspaceId);
    const adMatchResults = new Map<string, {
        generationId: string | null;
        matchType: "auto_hash" | null;
        matchDistance: number | null;
        ambiguous: boolean;
        imageHash: string | null;
    }>();
    await Promise.allSettled(ads.map(async (ad) => {
        const result: { generationId: string | null; matchType: "auto_hash" | null; matchDistance: number | null; ambiguous: boolean; imageHash: string | null } = {
            generationId: null,
            matchType: null,
            matchDistance: null,
            ambiguous: false,
            imageHash: null,
        };
        try {
            let imageUrl: string | null = null;
            let creativeId: string | null = null;
            if (ad.creative && typeof ad.creative === "object") {
                // FIX 4: with the expanded fields string, Meta returns the
                // image_url + thumbnail_url directly. Prefer image_url,
                // fall back to thumbnail_url, fall back to a separate
                // creative fetch (handles the rare case where the
                // expanded fields are missing).
                const creativeObj = ad.creative as { id?: string; image_url?: string; thumbnail_url?: string };
                creativeId = creativeObj.id || null;
                imageUrl = creativeObj.image_url || creativeObj.thumbnail_url || null;
                if (!imageUrl && creativeId) {
                    const meta = await fetchAdCreativeImage(accessToken, creativeId);
                    if (meta) imageUrl = meta.image_url || meta.thumbnail_url || null;
                }
            } else if (typeof ad.creative === "string") {
                // Legacy / edge case: Meta sometimes returns the creative
                // as a bare ID string instead of an object.
                creativeId = ad.creative;
                const meta = await fetchAdCreativeImage(accessToken, ad.creative);
                if (meta) imageUrl = meta.image_url || meta.thumbnail_url || null;
            }
            if (imageUrl) {
                try {
                    const buf = await downloadCreativeImage(imageUrl);
                    const hash = await computeHash(buf);
                    result.imageHash = hash;
                    const match = await matchAdCreative(hash, fingerprintIndex, 10);
                    result.generationId = match.generationId;
                    result.matchType = match.matchType;
                    result.matchDistance = match.matchDistance;
                    result.ambiguous = match.ambiguous;
                } catch (dlErr: unknown) {
                    errors.push(`imageDownload failed for ${ad.id}: ${(dlErr as Error).message}`);
                }
            }
        } catch (e: unknown) {
            errors.push(`imageMatch failed for ${ad.id}: ${(e as Error).message}`);
        }
        adMatchResults.set(ad.id, result);
    }));

    // 9. Build per-ad docs and persist (skip ads that already have a link —
    //    either manual or auto_hash from a previous sync; FR / §4.3 lock).
    let matchedCount = 0;
    let unmatchedCount = 0;
    let ambiguousCount = 0;

    const adAccountRef = getDb()
        .collection("users").doc(userId)
        .collection("workspaces").doc(workspaceId)
        .collection("adAccounts").doc(accountId);

    // Batch all writes — Firestore batch max 500 ops; chunk if needed.
    const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

    // Batch-load existing adPerformance docs to avoid N+1 reads.
    // We fetch the entire collection (bounded by the worker's account
    // scope) — keyed by adId so the loop can read matchType in O(1).
    const existingByAdId = new Map<string, Partial<AdDoc>>();
    try {
        const existingSnap = await adAccountRef.collection("adPerformance").get();
        for (const d of existingSnap.docs) {
            existingByAdId.set(d.id, d.data() as Partial<AdDoc>);
        }
    } catch (e: unknown) {
        errors.push(`load existing adPerformance failed: ${(e as Error).message}`);
    }

    // Phase 14 — Layer 4b (T044): collect inputs for the two-component
    // learning aggregates as the ad loop runs. We only include matched
    // conversion ads (the rest are excluded by `isEligibleForLearning`
    // in the aggregator). The accumulator lives in the function scope so
    // it doesn't grow between syncs.
    const learnedAds: AdForLearning[] = [];

    for (const ad of ads) {
        const windows = adInsightsMap.get(ad.id);
        if (!windows) continue;
        const metrics = aggregateAdMetrics(windows);
        const adSet = adSetById.get(ad.adset_id || "") || null;
        const ctx = adSet ? classifyTargeting(adSet.targeting) : { geoTier: "tier3_egypt_na" as GeoTier, audienceType: "broad" as AudienceType };
        const campaign = adSet ? campaignById.get(adSet.campaign_id || "") : null;
        const objective = classifyCampaignObjective(campaign?.objective);
        const match = adMatchResults.get(ad.id);

        // Precedence: a manual or prior auto link locks this ad (FR §4.3).
        const existingData = existingByAdId.get(ad.id);
        const existingMatchType = existingData?.matchType;

        let generationId: string | null = match?.generationId ?? null;
        let matchType: "auto_hash" | "manual" | null = match?.matchType ?? null;
        let matchDistance: number | null = match?.matchDistance ?? null;

        if (existingMatchType === "manual" || existingMatchType === "auto_hash") {
            // Lock — keep the prior link (FR / §4.3).
            generationId = (existingData?.generationId as string | null) ?? generationId;
            matchType = existingMatchType;
            matchDistance = (existingData?.matchDistance as number | null) ?? matchDistance;
        }

        // FIX 5A: if the existing record was already cascade-marked
        // (`metadataAvailable: false` + `deletedGenerationId`), keep that
        // state across this sync — the cascade triggered because the
        // matched generation was deleted, and that doesn't change just
        // because we got fresh Meta data. The sync may still refresh
        // performance metrics, but the dashboard still renders this ad
        // as "unmatched (source deleted)".
        // Read these fields via a wider type — `AdDoc` is the strict
        // shape WE write, but existing docs may have the cascade fields
        // written by `generationDeleteCascade`.
        // NULL SAFETY: `existingByAdId.get()` returns undefined on a
        // first-ever sync (no adPerformance docs exist yet). The cast alone
        // does NOT make the value safe — it only silences the compiler — so
        // the `.deletedGenerationId` read below crashed with
        // "Cannot read properties of undefined". Default to {} so every
        // field read degrades to undefined instead of throwing.
        const existingRaw = (existingData ?? {}) as Partial<AdDoc> & {
            deletedGenerationId?: unknown;
        };
        const existingDeletedGenerationId = typeof existingRaw.deletedGenerationId === "string"
            ? existingRaw.deletedGenerationId
            : null;
        const keepMetadataUnavailable = existingData?.metadataAvailable === false
            && existingDeletedGenerationId !== null;
        // The `keepMetadataUnavailable` flag is consumed by the
        // `metadataAvailable` write below — when true, the sync preserves
        // the cascade mark instead of flipping back to true. No separate
        // branch needed here.

        // Counted as "matched" if the ad carries ANY valid link (auto_hash
        // or manual with a generationId). Ambiguous auto matches and ads
        // with no generationId stay in the unmatched / ambiguous buckets.
        if (generationId && (matchType === "auto_hash" || matchType === "manual")) matchedCount++;
        else if (match?.ambiguous) ambiguousCount++;
        else unmatchedCount++;

        // Phase 14 — Layer 4b (T044 setup): collect matched generation ids
        // so the learning aggregates step (after this loop) can load their
        // generation docs in a single batch.
        if (generationId && (matchType === "auto_hash" || matchType === "manual")) {
            matchedGenIds.add(generationId);
        }

        const ageDays = computeAgeDays(ad, windows);

        // Phase 14 — Layer 4 (T041): compute the Qarar verdict for this
        // ad. The engine reads from the per-ad metrics + account baselines;
        // settings come from the funnel doc loaded once above.
        const verdictForEngine: AdPerformanceForVerdict = {
            impressions3d: metrics.impressions3d,
            spend3d: metrics.spend3d,
            spendToday: metrics.spendToday,
            ctrLink: metrics.ctrLink,
            ctrAll: metrics.ctrAll,
            cpm3d: metrics.cpm3d,
            cpa3d: metrics.cpa3d,
            conversions3d: metrics.conversions3d,
            spendSharePct: computeSpendSharePct(ad.id, ad.adset_id || "", perAdSetSpend),
            peak1dCtr: metrics.peak1dCtr,
            ageDays,
        };
        // Per-ad ad-set state. K5's "ad set losing" branch needs a flag from
        // the parent ad-set. We compute the ad-set CPA from the
        // 3-day rollup and compare to the target.
        const setId = ad.adset_id || "";
        const adSetSpend3d = adSetTotals.get(setId) || 0;
        const adSetConv3d = perAdSetConversions.get(setId) || 0;
        // Effective target (effectiveTargetCPA for paid / effectiveTargetCPL
        // for free). The qarar engine uses the same value for CB and S1.
        const target = funnelSettings
            ? getEffectiveTarget(funnelSettings.derived) ?? Infinity
            : Infinity;
        // adSetCpa: undefined if no conversions (the engine treats this as
        // "no data" and falls through to leave-it per the K5 matrix).
        const adSetCpa3d = adSetConv3d > 0 ? adSetSpend3d / adSetConv3d : undefined;
        // adSetHittingTarget: true when the ad-set is at-or-under target
        // (engine matrix: hit-target → leave it; missing-target → 🔴 weak).
        // undefined when CPA is missing (engine falls through to leave-it).
        const adSetHittingTarget = adSetCpa3d === undefined
            ? undefined
            : adSetCpa3d <= target;
        const baselinesForEngine = baselines
            ? {
                linkCtr90d: baselines.linkCtr90d,
                cpm14d: baselines.cpm14d,
                cpaCpl30d: baselines.cpaCpl30d,
                cpc30d: baselines.cpc30d,
            }
            : null;
        let verdictResult;
        try {
            verdictResult = evaluateVerdict(
                verdictForEngine,
                funnelSettings,
                objective.raw,
                baselinesForEngine,
                { adSetHittingTarget },
            );
        } catch (e: unknown) {
            // Defensive: a buggy verdict should never break the sync.
            errors.push(`verdict failed for ${ad.id}: ${(e as Error).message}`);
            verdictResult = {
                verdict: "⏳" as const,
                ruleCode: "data_gate",
                reasonAr: "لا توجد بيانات كافية بعد",
                diagnosisAr: null,
                evaluatedAt: nowMs,
            };
        }

        const adDoc: AdDoc = {
            adId: ad.id,
            adName: ad.name,
            thumbnailUrl: (ad.creative && typeof ad.creative === "object")
                ? (ad.creative.image_url || ad.creative.thumbnail_url || undefined)
                : undefined,
            generationId,
            matchType,
            matchDistance,
            // FIX 5A: don't recompute to true if the delete cascade already
            // set it false. Otherwise the sync would silently undo the
            // cascade and the dashboard would show stale metadata.
            metadataAvailable: keepMetadataUnavailable
                ? false
                : generationId !== null,
            geoTier: ctx.geoTier,
            audienceType: ctx.audienceType,
            campaignObjective: objective.bucket,
            campaignObjectiveRaw: objective.raw,
            spend3d: metrics.spend3d,
            spend7d: metrics.spend7d,
            creativeType: deriveCreativeType(ad.creative),
            spendToday: metrics.spendToday,
            impressions3d: metrics.impressions3d,
            cpa3d: metrics.cpa3d,
            ctrLink: metrics.ctrLink,
            ctrAll: metrics.ctrAll,
            conversions3d: metrics.conversions3d,
            frequency3d: metrics.frequency3d,
            spendSharePct: computeSpendSharePct(ad.id, ad.adset_id || "", perAdSetSpend),
            ageDays,
            cpm3d: metrics.cpm3d,
            peak1dCtr: metrics.peak1dCtr,
            creativeId: typeof ad.creative === "object" && ad.creative ? ad.creative.id || null : null,
            imageHash: match?.imageHash ?? null,
            // Phase 14 — Layer 4 (Qarar verdict)
            verdict: verdictResult.verdict,
            ruleCode: verdictResult.ruleCode,
            reasonAr: verdictResult.reasonAr,
            diagnosisAr: verdictResult.diagnosisAr,
            evaluatedAt: verdictResult.evaluatedAt,
            schemaVersion: 1,
        };
        writes.push({
            ref: adAccountRef.collection("adPerformance").doc(ad.id),
            data: adDoc as unknown as Record<string, unknown>,
        });

        // Phase 14 — Layer 4b (T044): snapshot the ad for the learning
        // aggregator. The matched-generation fields (hookAngle, layout,
        // modes, art direction, universe) are filled in below by the
        // batch generation read; we emit a placeholder for now and patch
        // the entries once we have the data. This keeps the loop single-
        // pass for performance.
        if (generationId && (matchType === "auto_hash" || matchType === "manual")) {
            // metadataAvailable on the AdDoc is the same flag the learning
            // engine uses to skip deleted-generation ads.
            const adIsAvailable = keepMetadataUnavailable
                ? false
                : generationId !== null;
            learnedAds.push({
                adId: ad.id,
                generationId,
                matchType,
                metadataAvailable: adIsAvailable,
                campaignObjective: objective.bucket,
                geoTier: ctx.geoTier,
                audienceType: ctx.audienceType,
                ctrLink: metrics.ctrLink,
                cpm3d: metrics.cpm3d,
                conversions3d: metrics.conversions3d,
                verdict: verdictResult.verdict,
                hookAngle: null,           // patched below
                layoutTemplate: null,      // patched below
                creativeModes: [],         // patched below
                artDirection: null,        // patched below
                universe: null,             // patched below
            });
        }
    }

    // Phase 14 — Layer 4b (T044): compute the two-component learning
    // aggregates. Skipped entirely if no matched conversion ads were
    // collected (e.g. fresh account, or every ad failed image matching).
    if (learnedAds.length > 0) {
        try {
            // 1. Batch-load matched generation docs. A single
            //    collectionGroup 'getAll' would be more efficient but
            //    Firestore limits to 10 per getAll batch — using
            //    `in` queries is bounded to 30 per query. We use a
            //    chunked loop.
            const genMap = await batchLoadGenerations(learnedAds.map((a) => a.generationId).filter((g): g is string => !!g));
            // 2. Patch learnedAds with the per-generation metadata
            //    (hookAngle, layoutTemplate, creativeModes, artDirection,
            //    universe).
            for (const entry of learnedAds) {
                if (!entry.generationId) continue;
                const gen = genMap.get(entry.generationId);
                if (!gen) continue;
                // The generation doc shape is the union of (a) the
                // `input` and (b) `creativeIdentity` blocks (see
                // feedbackService.saveGeneration). We read the most
                // specific field first, fall back to a sibling if absent.
                const input = (gen.input || {}) as Record<string, unknown>;
                const ci = (gen.creativeIdentity || {}) as Record<string, unknown>;
                entry.hookAngle =
                    pickString(input.coldHookAngle)
                    || pickString(input.hookAngle)
                    || pickString(ci.hookAngle);
                entry.layoutTemplate =
                    pickString(ci.contractTemplateId)
                    || pickString(gen.contractTemplateId);
                // Modes: prefer the primary input field; fall back to the
                // `creativeIdentity.selectedModes` field for legacy
                // generation docs that don't carry offerCreativeMode.
                // The `||` check above was wrong because `extractModes`
                // always returns an array, and `[]` is truthy — so the
                // fallback was never reached. Use a length check.
                const inputModes = extractModes(input.offerCreativeMode);
                entry.creativeModes = inputModes.length > 0
                    ? inputModes
                    : extractModes(ci.selectedModes);
                entry.artDirection =
                    pickString(input.visualSubStyle)
                    || pickString(ci.visualSubStyle);
                entry.universe =
                    pickString(input.preferredUniverse)
                    || pickString(ci.universeId);
            }
            // 3. Load existing aggregates. CRITICAL: any read error here
            //    must PROPAGATE (not be caught) — silently returning [] would
            //    cause the aggregator to compute stats from a wrong baseline,
            //    and the Firestore write would overwrite historical data
            //    with garbage. The outer try/catch records the failure and
            //    skips the aggregate writes, preserving the existing docs.
            const [existingHookDocs, existingVisualDocs] = await Promise.all([
                adAccountRef.collection("hookPerformance").get(),
                adAccountRef.collection("visualPerformance").get(),
            ]);
            const existingHook: HookPerformanceAggregate[] = existingHookDocs.docs.map((d) => d.data() as HookPerformanceAggregate);
            const existingVisual: VisualPerformanceAggregate[] = existingVisualDocs.docs.map((d) => d.data() as VisualPerformanceAggregate);
            // 4. Compute the new aggregates (OVERWRITE semantics — see
            //    learningAggregates.ts for the contract).
            const newHook = updateHookAggregates(learnedAds, existingHook);
            const newVisual = updateVisualAggregates(learnedAds, existingVisual);
            // 5. Write back. Use set with merge=true so concurrent updates
            //    to other dimensions don't clobber.
            for (const [angleKey, agg] of newHook) {
                writes.push({
                    ref: adAccountRef.collection("hookPerformance").doc(angleKey),
                    data: agg as unknown as Record<string, unknown>,
                });
            }
            for (const [patternKey, agg] of newVisual) {
                if (!patternKey) continue;
                writes.push({
                    ref: adAccountRef.collection("visualPerformance").doc(patternKey),
                    data: agg as unknown as Record<string, unknown>,
                });
            }
        } catch (e: unknown) {
            // Never break the sync because of a learning-aggregate glitch.
            // This catch handles: (a) generation-load failures, (b) the
            // hook/visual get() above throwing. In both cases we skip the
            // aggregate writes — the existing Firestore docs are left
            // untouched.
            errors.push(`learning aggregate update failed: ${(e as Error).message}`);
        }
    }

    // Persist baselines + snapshot.
    if (baselines) {
        writes.push({
            ref: adAccountRef.collection("baselines").doc("current"),
            data: { ...baselines, computedAt: nowMs },
        });
    }

    const snapshotId = `snap_${nowMs}_${trigger}`;
    writes.push({
        ref: adAccountRef.collection("syncSnapshots").doc(snapshotId),
        data: {
            snapshotId,
            syncedAt: nowMs,
            trigger,
            status: errors.length > 0 ? "partial" : "ok",
            raw: {
                campaigns: campaigns.length,
                adSets: adSets.length,
                ads: ads.length,
            },
            counts: {
                campaigns: campaigns.length,
                adSets: adSets.length,
                ads: ads.length,
                matched: matchedCount,
                unmatched: unmatchedCount,
                ambiguous: ambiguousCount,
            },
            errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
        },
    });

    // Commit in chunks of 450. FIX 5B: use `merge: true` so the sync
    // does NOT wipe fields the delete cascade wrote (e.g.
    // `deletedGenerationId`, `deletedGenerationAt`, `matchedManuallyAt`).
    for (let i = 0; i < writes.length; i += 450) {
        const chunk = writes.slice(i, i + 450);
        const batch = getDb().batch();
        for (const w of chunk) batch.set(w.ref, w.data, { merge: true });
        await batch.commit().catch((e: unknown) => {
            errors.push(`batch commit failed: ${(e as Error).message}`);
        });
    }

    // 11. Prune to last 7 snapshots.
    try {
        await pruneSnapshots(userId, workspaceId, accountId);
    } catch (e: unknown) {
        errors.push(`pruneSnapshots failed: ${(e as Error).message}`);
    }

    // 12. Update lastMetaSyncAt + lastSyncStatus on the connection doc.
    const status: "ok" | "partial" | "failed" = errors.length > 0
        ? (matchedCount + unmatchedCount > 0 ? "partial" : "failed")
        : "ok";
    try {
        await patchStoredConnection(userId, workspaceId, {
            lastMetaSyncAt: nowMs,
            lastSyncStatus: status,
            needsReauth,
            // FIX 3 (dashboard-polish): persist the account currency so the
            // dashboard can label spend. Only pass it when we actually
            // fetched one, so a transient failure never clears a good value.
            ...(accountCurrency ? { currency: accountCurrency } : {}),
        });
    } catch (e: unknown) {
        errors.push(`patch connection failed: ${(e as Error).message}`);
    }

    return {
        ok: status !== "failed",
        status,
        counts: {
            campaigns: campaigns.length,
            adSets: adSets.length,
            ads: ads.length,
            matched: matchedCount,
            unmatched: unmatchedCount,
            ambiguous: ambiguousCount,
        },
        errors,
        needsReauth,
        lastMetaSyncAt: nowMs,
    };
}

// ─── Token resolution ─────────────────────────────────────────

async function resolveAccessToken(conn: StoredConnection): Promise<string> {
    if (conn.encryptedToken) {
        // KMS-encrypted envelope.
        const { decrypt } = await import("../tokenCrypto.js");
        return await decrypt(conn.encryptedToken);
    }
    if (conn.legacyToken) {
        // Legacy AES-256-GCM string from the user-level metaConnections doc.
        return await decryptLegacyToken(conn.legacyToken);
    }
    throw new Error("No encrypted token stored for this workspace.");
}

function computeAgeDays(_ad: MetaAd, _windows: InsightsTimeWindows): number {
    // Use the date_stop of the latest row as the "ad last seen" anchor.
    // For now we just compute "days since the most recent row's date_stop".
    const lastRow = _windows.last7DaysDaily[_windows.last7DaysDaily.length - 1];
    if (!lastRow || typeof lastRow.date_stop !== "string") return 0;
    const stop = Date.parse(lastRow.date_stop);
    if (!Number.isFinite(stop)) return 0;
    return Math.max(0, Math.floor((Date.now() - stop) / 86_400_000));
}

function emptyCounts(): SyncResult["counts"] {
    return { campaigns: 0, adSets: 0, ads: 0, matched: 0, unmatched: 0, ambiguous: 0 };
}

// --- Learning aggregate helpers (T044) -------------------------

/**
 * Batch-load generation docs by id. Uses the top-level generations/{id}
 * collection (the canonical location � feedbackService.saveGeneration
 * writes there). in queries support up to 30 values per query; we
 * chunk accordingly.
 */
async function batchLoadGenerations(generationIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    if (generationIds.length === 0) return out;
    const unique = Array.from(new Set(generationIds));
    const db = getDb();
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 30) {
        chunks.push(unique.slice(i, i + 30));
    }
    for (const chunk of chunks) {
        try {
            const snap = await db.collection("generations").where("__name__", "in", chunk).get();
            for (const d of snap.docs) {
                out.set(d.id, d.data() as Record<string, unknown>);
            }
        } catch (e: unknown) {
            // where __name__ in may not be supported in every Firestore
            // version; fall back to per-id reads.
            for (const id of chunk) {
                try {
                    const doc = await db.collection("generations").doc(id).get();
                    if (doc.exists) out.set(id, doc.data() as Record<string, unknown>);
                } catch {
                    // ignore � missing gen docs are fine, the learning
                    // aggregator just won't see them.
                }
            }
        }
    }
    return out;
}

function pickString(v: unknown): string | null {
    if (typeof v === "string" && v.length > 0) return v;
    return null;
}

/**
 * The generation doc carries offerCreativeMode as an array of strings
 * (the multi-select field). For older docs it may also live on
 * creativeIdentity.selectedModes. Some entries may be a single string
 * (legacy). Normalize to string[].
 */
function extractModes(v: unknown): string[] {
    if (Array.isArray(v)) {
        return v.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
    if (typeof v === "string" && v.length > 0) return [v];
    // creativeIdentity.selectedModes is a parallel field � caller-side
    // helper, not used here.
    return [];
}
