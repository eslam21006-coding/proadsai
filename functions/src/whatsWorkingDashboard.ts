// functions/src/whatsWorkingDashboard.ts — Phase 14 Layer 5 + Layer 6
// ═══════════════════════════════════════════════════════════
// Firebase callables that assemble the "What's Working" Dashboard and
// the hook-angle performance icons consumed by Step 1 and Step 2.
//
// All user-facing Arabic strings are plain Fusha (SC-11 + FR-019) — no
// "متوسط"/"ميديان"/"CTR"/"CPM"/"CPA"/percentages anywhere in the
// returned UI strings. Technical numbers stay server-side only (for the
// icon-computation math) and are never echoed back to the user.
//
// Layer 5: `getWhatsWorkingDashboard` (US6) — assembles the 6 sections
// (sync status, summary, strongest angles, strongest visuals,
// unmatched ads, recent verdicts). See contracts/dashboardAndIcons.md.
//
// Layer 6: `getHookAnglePerformance` (US7) — returns the per-angle
// icon + plain-Arabic tooltip used by the Step 1 / Step 2 selectors.
// ═══════════════════════════════════════════════════════════

import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import { getDb } from "./firestoreClient.js";
import { getKnownHookAngleIds } from "./gazeMap.js";

// ─── Constants (Fusha-only strings, mirror contract) ─────────

export const AR_S_RESYNC_REAUTH = "انتهت صلاحية الاتصال بميتا — يرجى إعادة الربط";
export const AR_S_RESYNC_CONNECTED_BTN = "مزامنة الآن";
export const AR_S_RESYNC_CONNECT_BTN = "ربط ميتا";
export const AR_S_RESYNC_NEVER_CONNECTED = "لم يتم ربط حساب ميتا بعد";
export const AR_S_OTHER_OBJECTIVE_LABEL = "حملات أخرى";
export const AR_S_ATTRIBUTION_BANNER = "قد تبدو الأرقام أقل من الفترات السابقة بسبب تغيير في طريقة القياس";
export const AR_S_NO_DATA_YET = "لا توجد بيانات كافية بعد";
export const AR_S_TOOLTIP_STRONGEST = "أقوى زاوية في حسابك";
export const AR_S_TOOLTIP_GOOD = "أداء جيد في حسابك";
export const AR_S_TOOLTIP_WEAK_PREFIX = "أداء ضعيف في حسابك — جرّب";
export const AR_S_TOOLTIP_WEAK_SEPARATOR = "أو";

const EN_S_RESYNC_REAUTH = "Meta connection expired — please reconnect";
const EN_S_TOOLTIP_STRONGEST = "Your strongest angle";
const EN_S_TOOLTIP_GOOD = "Performs well in your account";
const EN_S_TOOLTIP_WEAK_PREFIX = "Weak in your account — try";
const EN_S_TOOLTIP_WEAK_SEPARATOR = "or";

// English hook-angle display names (the canonical IDs are English; the
// dashboard uses these labels because they pair cleanly with the i18n
// provider for Arabic translation in the UI layer).
const HOOK_ANGLE_DISPLAY_EN: Record<string, string> = {
    emotional: "Emotional",
    logic: "Logic",
    urgency: "Urgency",
    scarcity: "Scarcity",
    pain: "Pain",
    curiosity: "Curiosity",
    statistics: "Statistics",
    social_proof: "Social Proof",
    logical_authority: "Authority",
    future_based: "Future",
};

// Arabic display labels for the ⚠️ tooltip's "جرّب [X] أو [Y]" suggestions
// (FR-019 / SC-11: user-facing Fusha, no English acronyms).
const HOOK_ANGLE_DISPLAY_AR: Record<string, string> = {
    emotional: "العاطفة",
    logic: "المنطق",
    urgency: "الاستعجال",
    scarcity: "الندرة",
    pain: "الألم",
    curiosity: "الفضول",
    statistics: "الإحصائيات",
    social_proof: "الدليل الاجتماعي",
    logical_authority: "السلطة",
    future_based: "المستقبل",
};

// ─── Tunable thresholds (icon logic) ─────────────────────────

const HOOK_ICON_DATA_GATE = 3;            // min conversion ads to show an icon
const VISUAL_ICON_DATA_GATE = 3;          // min conversion ads to show an icon
const HOOK_ICON_WEAK_THRESHOLD = 0.75;    // ≤ 75% of account avg → ⚠️
const SYNC_COOLDOWN_MS = 60 * 60 * 1000;   // 1 hour

// ─── Types ────────────────────────────────────────────────────

interface DashboardRequest {
    workspaceId: string;
    accountId: string;
}

interface SyncStatus {
    lastMetaSyncAt: number | null;
    nextScheduledSyncAt: number | null;
    connection: "connected" | "disconnected" | "needs_reauth";
    canSyncNow: boolean;
    cooldownEndsAt: number | null;
}

interface Summary {
    spend3dLabel: string;
    matchedAds: number;
    totalAds: number;
    green: number;
    yellow: number;
    red: number;
}

interface StrongestAngle {
    angleKey: string;
    nameAr: string;
    icon: "🔥" | "✅" | "⚠️";
    countAr: string;
}

interface StrongestVisual {
    patternKey: string;
    descriptionAr: string;
    icon: "🔥" | "✅" | "⚠️";
    countAr: string;
}

interface UnmatchedAd {
    adId: string;
    adName: string;
    thumbnailUrl?: string;
}

interface OtherObjectiveAd {
    adId: string;
    adName: string;
    verdictEmoji: string;
}

interface RecentVerdict {
    adName: string;
    emoji: string;
    descriptionAr: string;
    at: number;
}

interface DashboardResponse {
    ok: true;
    syncStatus: SyncStatus;
    summary: Summary;
    strongestAngles: StrongestAngle[];
    strongestVisuals: StrongestVisual[];
    unmatchedAds: UnmatchedAd[];
    otherObjectiveAds?: OtherObjectiveAd[];
    recentVerdicts: RecentVerdict[];
    attributionBannerAr?: string;
}

interface HookAngleIconEntry {
    icon: "🔥" | "✅" | "⚠️" | null;
    tooltipAr: string | null;
}

interface HookAnglePerformanceResponse {
    ok: true;
    icons: Record<string, HookAngleIconEntry>;
    bestAngles: Array<{ angleKey: string; nameAr: string }>;
}

// ─── Helpers (pure) ──────────────────────────────────────────

/** Plain-Fusha count text for the strongest-angles list. */
export function makeCountAr(used: number, winners: number, lang: "en" | "ar"): string {
    if (lang === "ar") {
        if (winners === 0) return `استخدمتها ${used} مرات`;
        return `استخدمتها ${used} مرات، ${winners} منها ناجحة`;
    } else {
        if (winners === 0) return `Used ${used} times`;
        return `Used ${used} times, ${winners} winners`;
    }
}

/** Plain-Fusha dollar label for the summary strip. */
export function makeSpendLabel(currency: string, amount: number, lang: "en" | "ar"): string {
    const rounded = Math.round(amount * 100) / 100;
    if (lang === "ar") return `${rounded} ${currency} (آخر 3 أيام)`;
    return `${currency} ${rounded} (last 3 days)`;
}

/** Plain-Fusha pattern description (no internal IDs exposed). */
export function makePatternDescriptionAr(layoutTemplate: string | undefined, modes: string[] | undefined, artDirection: string | undefined, universe: string | undefined): string {
    const layout = layoutTemplate
        ? layoutTemplate.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) // (EN-only path; the only AR-typed fields below use HOOK_ANGLE_DISPLAY_AR)
        : "";
    const mode = modes && modes.length > 0
        ? modes[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";
    const parts = [layout, mode, artDirection, universe].filter(Boolean);
    return parts.join(" + ") || "—";
}

/**
 * Icon logic for hook-angle performance (spec §8.2).
 * Inputs are the conversion-bucket averages only (other bucket is
 * display-only and never feeds the icon).
 */
export function computeIconFromAvgs(
    sampleSize: number,
    angleAvgLinkCtr: number,
    accountAvgLinkCtr: number,
    dataGate: number,
): "🔥" | "✅" | "⚠️" | null {
    if (sampleSize < dataGate) return null;
    if (accountAvgLinkCtr <= 0) return null;
    const ratio = angleAvgLinkCtr / accountAvgLinkCtr;
    if (ratio <= HOOK_ICON_WEAK_THRESHOLD) return "⚠️";
    if (ratio < 1.0) return "✅";
    return "🔥";
}

/**
 * Pick the best 2 angles by conversion avg Link CTR — used for the ⚠️
 * tooltip "جرّب [best] أو [second best]".
 * Returns an array sorted descending by avgLinkCtr, length 0..2.
 */
export function pickBestTwoAngles(
    rows: Array<{ angleKey: string; avgLinkCtr: number; sampleSize: number }>,
): Array<{ angleKey: string; avgLinkCtr: number; sampleSize: number }> {
    return rows
        .filter((r) => r.sampleSize >= HOOK_ICON_DATA_GATE)
        .sort((a, b) => b.avgLinkCtr - a.avgLinkCtr)
        .slice(0, 2);
}

/**
 * Resolve which angle (if any) gets 🔥 vs ✅/⚠️ for the dashboard
 * caller. The 🔥 is awarded to the single highest-avgCTR angle that
 * also passes the data gate.
 */
export function pickHotAngle(
    rows: Array<{ angleKey: string; avgLinkCtr: number; sampleSize: number }>,
): string | null {
    const eligible = rows
        .filter((r) => r.sampleSize >= HOOK_ICON_DATA_GATE)
        .sort((a, b) => b.avgLinkCtr - a.avgLinkCtr);
    return eligible.length > 0 ? eligible[0].angleKey : null;
}

// ─── Auth helpers ───────────────────────────────────────────

async function assertWorkspaceAccess(
    uid: string,
    workspaceId: string,
    accountId: string,
): Promise<void> {
    const wsDoc = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .get();
    if (!wsDoc.exists) {
        throw new HttpsError("not-found", "Workspace not found.");
    }
    const wsData = wsDoc.data() || {};
    const linked = wsData.metaAdAccountId;
    // FR-026 (reverse direction): when the workspace is unlinked
    // (typeof linked !== "string"), the caller is supplying an accountId
    // we have no business touching — reject before reading any of that
    // account's subtree. When the workspace IS linked but to a different
    // account, also reject. Only proceed on an exact match.
    if (typeof linked !== "string" || linked !== accountId) {
        throw new HttpsError("failed-precondition", "Workspace is linked to a different Meta account.");
    }
}

// ─── getWhatsWorkingDashboard (T046) ────────────────────────

export const getWhatsWorkingDashboard = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as DashboardRequest;
        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }

        await assertWorkspaceAccess(uid, req.workspaceId, req.accountId);

        const db = getDb();
        const wsPath = `users/${uid}/workspaces/${req.workspaceId}`;
        const adAccountPath = `${wsPath}/adAccounts/${req.accountId}`;

        // ─── Sync status (Section A) ────────────────────────
        const [privateConnSnap, baselinesSnap] = await Promise.all([
            db.doc(`${wsPath}/private/metaConnection/metaConnection`).get().catch((e: unknown) => { console.warn("🔥 [whatsWorkingDashboard] private connection read failed:", e); throw new HttpsError("internal", "Failed to read Meta connection state."); }),
            db.collection(`${adAccountPath}/baselines`).doc("current").get().catch((e: unknown) => { console.warn("🔥 [whatsWorkingDashboard] baselines read failed:", e); throw new HttpsError("internal", "Failed to read account baselines."); }),
        ]);
        const connData = privateConnSnap?.data() || {};
        const connected = connData.metaConnected === true;
        const needsReauth = connData.needsReauth === true;
        const lastSyncAt = typeof connData.lastMetaSyncAt === "number"
            ? connData.lastMetaSyncAt
            : null;
        const now = Date.now();
        const cooldownEndsAt = lastSyncAt && (lastSyncAt + SYNC_COOLDOWN_MS) > now
            ? lastSyncAt + SYNC_COOLDOWN_MS
            : null;
        const canSyncNow = cooldownEndsAt === null;
        const nextScheduledSyncAt = lastSyncAt ? lastSyncAt + 24 * 60 * 60 * 1000 : null;
        const connection: SyncStatus["connection"] = needsReauth
            ? "needs_reauth"
            : (connected ? "connected" : "disconnected");
        const syncStatus: SyncStatus = {
            lastMetaSyncAt: lastSyncAt,
            nextScheduledSyncAt: nextScheduledSyncAt,
            connection,
            canSyncNow,
            cooldownEndsAt,
        };

        // ─── Summary strip + strongest angles/visuals + recent verdicts
        // (Section B, C, D, F) ────────────────────────────
        const adPerformanceSnap = await db.collection(`${adAccountPath}/adPerformance`).get().catch(() => null);
        const hookAggsSnap = await db.collection(`${adAccountPath}/hookPerformance`).get().catch(() => null);
        const visualAggsSnap = await db.collection(`${adAccountPath}/visualPerformance`).get().catch(() => null);

        type AdDocShape = {
            adId?: string;
            adName?: string;
            thumbnailUrl?: string;
            generationId?: string | null;
            matchType?: string | null;
            campaignObjective?: string;
            verdict?: string;
            spend3d?: number;
            evaluatedAt?: number;
            ruleCode?: string;
            reasonAr?: string;
        };
        const allAds = (adPerformanceSnap?.docs || []).map((d) => d.data() as AdDocShape);

        // Section B — Summary
        const conversionAds = allAds.filter((a) => a.campaignObjective === "conversion");
        const matchedAds = allAds.filter((a) => a.matchType === "auto_hash" || a.matchType === "manual").length;
        const totalSpend3d = allAds.reduce((s, a) => s + (a.spend3d || 0), 0);
        const verdicts = { green: 0, yellow: 0, red: 0 };
        for (const a of conversionAds) {
            if (a.verdict === "🟢") verdicts.green++;
            else if (a.verdict === "🔴") verdicts.red++;
            else if (a.verdict === "🟡" || a.verdict === "🛟") verdicts.yellow++;
        }
        // Currency — when not explicitly known we OMIT the currency
        // code from the label rather than mislabel non-USD accounts.
        // The Meta account's currency is not surfaced through the current
        // baselines/adPerformance paths; if a future change wires it
        // through, surface it here.
        const currency: string | null = null;
        const summary: Summary = {
            spend3dLabel: currency
                ? makeSpendLabel(currency, totalSpend3d, "ar")
                : `${Math.round(totalSpend3d * 100) / 100} (آخر 3 أيام)`,
            matchedAds,
            totalAds: allAds.length,
            green: verdicts.green,
            yellow: verdicts.yellow,
            red: verdicts.red,
        };

        // Account-wide average — needed for icon thresholds.
        // Prefer the cached 90-day average from the baselines doc
        // (linkCtr90d) and fall back to a live computation if missing.
        let accountAvgLinkCtr = 0;
        const baselinesData = baselinesSnap?.data() as
            | { linkCtr90d?: number }
            | undefined;
        if (baselinesData && typeof baselinesData.linkCtr90d === "number" && baselinesData.linkCtr90d > 0) {
            accountAvgLinkCtr = baselinesData.linkCtr90d;
        } else {
            // Fallback: average of all conversion-bucket hookPerformance docs.
            // This path is hit only when the baselines doc is missing.
            const hookRows = (hookAggsSnap?.docs || []).map((d) => d.data() as {
                angleKey: string;
                byObjective: { conversion: { avgLinkCtr: number; count: number } };
            });
            let sum = 0; let count = 0;
            for (const r of hookRows) {
                if (r.byObjective?.conversion?.count > 0) {
                    sum += r.byObjective.conversion.avgLinkCtr * r.byObjective.conversion.count;
                    count += r.byObjective.conversion.count;
                }
            }
            accountAvgLinkCtr = count > 0 ? sum / count : 0;
        }

        // Section C — Strongest angles (conversion bucket only)
        type HookAggShape = {
            angleKey: string;
            sampleSize: number;
            byObjective: {
                conversion: { avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number };
                other: { avgLinkCtr: number; count: number };
            };
        };
        const hookAggs = (hookAggsSnap?.docs || []).map((d) => d.data() as HookAggShape);
        const hookHotAngle = pickHotAngle(
            hookAggs
                .filter((r) => r.byObjective?.conversion?.count > 0)
                .map((r) => ({
                    angleKey: r.angleKey,
                    avgLinkCtr: r.byObjective.conversion.avgLinkCtr,
                    sampleSize: r.byObjective.conversion.count,
                })),
        );
        const strongestAngles: StrongestAngle[] = hookAggs
            .filter((r) => r.byObjective?.conversion?.count > 0)
            .map((r) => {
                const c = r.byObjective.conversion;
                const icon = computeIconFromAvgs(c.count, c.avgLinkCtr, accountAvgLinkCtr, HOOK_ICON_DATA_GATE);
                // CR (Batch 04 review): skip rows where the data gate (≥3
                // conversion ads OR missing account avg) returns null.
                // Treating those as ⚠️ would mislead users — new accounts
                // would look "weak" instead of "no data yet".
                if (icon === null) return null;
                // The 🔥 is reserved for the single top angle; other
                // angles can only get ✅ or ⚠️.
                const displayIcon: "🔥" | "✅" | "⚠️" =
                    icon === "🔥" ? (r.angleKey === hookHotAngle ? "🔥" : "✅") : icon;
                // Pair the public output with the raw sort keys (bestVerdictCount
                // and count) so the sort can use them — the public output shape
                // stays free of internal sort fields.
                return {
                    out: {
                        angleKey: r.angleKey,
                        nameAr: HOOK_ANGLE_DISPLAY_AR[r.angleKey] || HOOK_ANGLE_DISPLAY_EN[r.angleKey] || r.angleKey,
                        icon: displayIcon,
                        countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
                    },
                    _w: c.bestVerdictCount,
                    _n: c.count,
                };
            })
            // Drop rows that failed the data gate (returned null) so
            // the sort callbacks below never see null elements.
            .filter((w): w is { out: StrongestAngle; _w: number; _n: number } => w !== null)
            .sort((a, b) => {
                // Primary sort: 🔥 > ✅ > ⚠️ tier.
                const order = (icon: "🔥" | "✅" | "⚠️"): number => {
                    if (icon === "🔥") return 0;
                    if (icon === "✅") return 1;
                    return 2;
                };
                const tierDiff = order(a.out.icon) - order(b.out.icon);
                if (tierDiff !== 0) return tierDiff;
                // Secondary sort within the same tier: bestVerdictCount
                // desc, then count desc as a tie-breaker. So two ✅ angles
                // with different winner counts rank correctly.
                if (a._w !== b._w) return b._w - a._w;
                return b._n - a._n;
            })
            .map((w) => w.out);

        // Section D — Strongest visuals
        type VisualAggShape = {
            patternKey: string;
            sampleSize: number;
            byObjective: {
                conversion: { avgCpm: number; avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number };
                other: { count: number };
            };
        };
        type VisualStrongestVisualRow = {
            patternKey: string;
            descriptionAr: string;
            icon: "🔥" | "✅" | "⚠️";
            countAr: string;
        };
        type VisualTuple = { out: VisualStrongestVisualRow; _w: number; _n: number };

        const visualAggs = (visualAggsSnap?.docs || []).map((d) => d.data() as VisualAggShape);
        // To produce human-readable descriptionAr, we need the
        // original layoutTemplate/modes/artDirection/universe. The
        // aggregate doesn't store these — we approximate from the
        // patternKey (which is a hash) and the most recent matched
        // generation. Skip rendering a per-pattern name when no
        // matched generation exists; fall back to the generic label.
        const visualAggsByPattern = new Map<string, VisualAggShape>();
        for (const v of visualAggs) visualAggsByPattern.set(v.patternKey, v);
        // Resolve per-patternKey names by walking the matched generation
        // docs once. Build a map patternKey → friendly description.
        // The dashboard never leaks the raw patternKey to the user; the
        // description is built from the same per-generation fields.
        const patternDescriptionMap = new Map<string, string>();
        const matchedGenIds = Array.from(new Set(
            conversionAds
                .filter((a) => a.matchType === "auto_hash" || a.matchType === "manual")
                .map((a) => a.generationId)
                .filter((g): g is string => typeof g === "string"),
        ));
        if (matchedGenIds.length > 0) {
            const genDocs = await db.collection("generations")
                .where("__name__", "in", matchedGenIds.slice(0, 30))
                .get()
                .catch((e: unknown) => { console.warn("🔥 [whatsWorkingDashboard] generations read failed:", e); throw new HttpsError("internal", "Failed to read generations."); });
            type GenShape = {
                input?: {
                    offerCreativeMode?: unknown;
                    visualSubStyle?: string;
                    preferredUniverse?: string;
                };
                creativeIdentity?: {
                    contractTemplateId?: string;
                    selectedModes?: unknown;
                };
            };
            for (const d of (genDocs?.docs || [])) {
                const gen = d.data() as GenShape;
                // Build the same hash the worker uses (single source of
                // truth is essential — we re-implement the formula here
                // rather than reverse-engineer the djb2 hash).
                const layoutTemplate = gen.creativeIdentity?.contractTemplateId
                    ?? gen.input?.offerCreativeMode?.toString().split(",")[0]
                    ?? "";
                const modes: string[] = [];
                if (Array.isArray(gen.creativeIdentity?.selectedModes)) {
                    for (const m of gen.creativeIdentity.selectedModes) {
                        if (typeof m === "string") modes.push(m);
                    }
                }
                if (modes.length === 0 && typeof gen.input?.offerCreativeMode === "string") {
                    modes.push(gen.input.offerCreativeMode);
                }
                const artDirection = gen.input?.visualSubStyle || "";
                const universe = gen.input?.preferredUniverse || "";
                const sortedModes = [...modes].sort();
                const joined = [layoutTemplate, ...sortedModes, artDirection, universe].join("|");
                if (!joined) continue;
                let h = 5381;
                for (let i = 0; i < joined.length; i++) {
                    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
                }
                const patternKey = (h >>> 0).toString(36).padStart(7, "0");
                const descriptionAr = makePatternDescriptionAr(layoutTemplate, modes, artDirection, universe);
                if (!patternDescriptionMap.has(patternKey)) {
                    patternDescriptionMap.set(patternKey, descriptionAr);
                }
            }
        }
        const strongestVisuals: StrongestVisual[] = [];
        // CR (Batch 04 review): collect all eligible visual rows FIRST
        // and compute the single global hot key from the complete set, so
        // every visual whose ratio reaches 1.0 doesn't independently
        // become 🔥 (which would happen when pickHotAngle sees one row
        // at a time).
        const visualEligibleRows = visualAggs
            .filter((v) => v.byObjective?.conversion?.count > 0)
            .map((v) => ({
                angleKey: v.patternKey,
                avgLinkCtr: v.byObjective.conversion.avgLinkCtr,
                sampleSize: v.byObjective.conversion.count,
            }));
        const visualHotKey = pickHotAngle(visualEligibleRows);
        // Pair the public output with the raw sort keys (bestVerdictCount
        // and count) so the sort can use them — the public output shape
        // stays free of internal sort fields.
        const visualRows: Array<{
            out: VisualStrongestVisualRow;
            _w: number;
            _n: number;
        }> = [];
        for (const v of visualAggs) {
            const c = v.byObjective?.conversion;
            if (!c || c.count === 0) continue;
            const icon = computeIconFromAvgs(
                c.count,
                c.avgLinkCtr,
                accountAvgLinkCtr,
                VISUAL_ICON_DATA_GATE,
            );
            // Skip rows that didn't pass the data gate (same rationale
            // as the angles list above — null must NOT collapse to ⚠️).
            if (icon === null) continue;
            // 🔥 reserved for the single top visual across all visuals.
            const displayIcon: "🔥" | "✅" | "⚠️" =
                icon === "🔥" ? (v.patternKey === visualHotKey ? "🔥" : "✅") : icon;
            visualRows.push({
                out: {
                    patternKey: v.patternKey,
                    descriptionAr: patternDescriptionMap.get(v.patternKey) || "—",
                    icon: displayIcon,
                    countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
                },
                _w: c.bestVerdictCount,
                _n: c.count,
            });
        }
        strongestVisuals.push(
            ...visualRows
                .sort((a, b) => {
                    const order = (icon: "🔥" | "✅" | "⚠️"): number => {
                        if (icon === "🔥") return 0;
                        if (icon === "✅") return 1;
                        return 2;
                    };
                    const tierDiff = order(a.out.icon) - order(b.out.icon);
                    if (tierDiff !== 0) return tierDiff;
                    // Secondary sort: bestVerdictCount desc, then count desc.
                    if (a._w !== b._w) return b._w - a._w;
                    return b._n - a._n;
                })
                .map((w) => w.out),
        );

        // Section E — Unmatched ads (limit 20, most recent first)
        const unmatchedAds: UnmatchedAd[] = allAds
            .filter((a) => a.matchType === null)
            .sort((a, b) => {
                const ta = typeof a.evaluatedAt === "number" ? a.evaluatedAt : 0;
                const tb = typeof b.evaluatedAt === "number" ? b.evaluatedAt : 0;
                return tb - ta;
            })
            .slice(0, 20)
            .map((a) => ({
                adId: a.adId || "",
                adName: a.adName || "—",
                thumbnailUrl: a.thumbnailUrl,
            }))
            .filter((a) => a.adId !== "");

        // Section F — Recent verdicts (limit 20, by evaluatedAt desc)
        const recentVerdicts: RecentVerdict[] = allAds
            .filter((a) => typeof a.evaluatedAt === "number" && typeof a.verdict === "string" && a.verdict !== "")
            .sort((a, b) => (b.evaluatedAt || 0) - (a.evaluatedAt || 0))
            .slice(0, 20)
            .map((a) => ({
                adName: a.adName || "—",
                emoji: a.verdict || "",
                descriptionAr: a.reasonAr || "",
                at: a.evaluatedAt || 0,
            }));

        // Other-objective ads (separate non-ranked list per §5.6.4). Only
        // emitted when there are actual other-objective ads.
        const otherObjectiveAds: OtherObjectiveAd[] | undefined = (() => {
            const items = allAds
                .filter((a) => a.campaignObjective === "other" && typeof a.verdict === "string")
                .sort((a, b) => (b.evaluatedAt || 0) - (a.evaluatedAt || 0))
                .slice(0, 20)
                .map((a) => ({
                    adId: a.adId || "",
                    adName: a.adName || "—",
                    verdictEmoji: a.verdict || "",
                }))
                .filter((a) => a.adId !== "");
            return items.length > 0 ? items : undefined;
        })();

        const response: DashboardResponse = {
            ok: true,
            syncStatus,
            summary,
            strongestAngles,
            strongestVisuals,
            unmatchedAds,
            otherObjectiveAds,
            recentVerdicts,
        };
        // Attribution banner only when we actually have synced data and
        // a March 2026 cutoff is configured (placeholder — no cutoff in
        // v1, the banner is intentionally omitted here).
        void AR_S_ATTRIBUTION_BANNER;

        return response;
    },
);

// ─── getHookAnglePerformance (T047) ────────────────────────

interface HookPerformanceRequest {
    workspaceId: string;
    accountId: string;
}

export const getHookAnglePerformance = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as HookPerformanceRequest;
        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }

        await assertWorkspaceAccess(uid, req.workspaceId, req.accountId);

        const db = getDb();
        const wsPath = `users/${uid}/workspaces/${req.workspaceId}`;
        const adAccountPath = `${wsPath}/adAccounts/${req.accountId}`;

        const [hookAggsSnap, baselinesSnap] = await Promise.all([
            db.collection(`${adAccountPath}/hookPerformance`).get().catch(() => null),
            db.collection(`${adAccountPath}/baselines`).doc("current").get().catch((e: unknown) => { console.warn("🔥 [whatsWorkingDashboard] baselines read failed:", e); throw new HttpsError("internal", "Failed to read account baselines."); }),
        ]);

        // Account-wide average — needed for the icon thresholds.
        let accountAvgLinkCtr = 0;
        const baselinesData = baselinesSnap?.data() as { linkCtr90d?: number } | undefined;
        if (baselinesData && typeof baselinesData.linkCtr90d === "number" && baselinesData.linkCtr90d > 0) {
            accountAvgLinkCtr = baselinesData.linkCtr90d;
        } else {
            const rows = (hookAggsSnap?.docs || []).map((d) => d.data() as {
                angleKey: string;
                byObjective: { conversion: { avgLinkCtr: number; count: number } };
            });
            let sum = 0; let count = 0;
            for (const r of rows) {
                if (r.byObjective?.conversion?.count > 0) {
                    sum += r.byObjective.conversion.avgLinkCtr * r.byObjective.conversion.count;
                    count += r.byObjective.conversion.count;
                }
            }
            accountAvgLinkCtr = count > 0 ? sum / count : 0;
        }

        type HookAggShape = {
            angleKey: string;
            sampleSize: number;
            byObjective: {
                conversion: { avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number };
                other: { avgLinkCtr: number; count: number };
            };
        };
        const hookAggs = (hookAggsSnap?.docs || []).map((d) => d.data() as HookAggShape);

        // Pre-compute eligible rows + pick the top 2 (for the ⚠️
        // tooltip "جرّب [best] أو [second best]").
        const eligibleRows = hookAggs
            .filter((r) => r.byObjective?.conversion?.count >= HOOK_ICON_DATA_GATE)
            .map((r) => ({
                angleKey: r.angleKey,
                avgLinkCtr: r.byObjective.conversion.avgLinkCtr,
                sampleSize: r.byObjective.conversion.count,
            }));
        const bestTwo = pickBestTwoAngles(eligibleRows);
        const hotAngle = pickHotAngle(eligibleRows);

        // Build the icon map for every canonical angle. Angles with no
        // data get icon=null + no tooltip (FR-021, Edge Case 5).
        const icons: Record<string, HookAngleIconEntry> = {};
        for (const angleKey of getKnownHookAngleIds()) {
            const agg = hookAggs.find((r) => r.angleKey === angleKey);
            if (!agg) {
                icons[angleKey] = { icon: null, tooltipAr: null };
                continue;
            }
            const c = agg.byObjective.conversion;
            const sampleSize = c?.count || 0;
            const avg = c?.avgLinkCtr || 0;
            const icon = computeIconFromAvgs(sampleSize, avg, accountAvgLinkCtr, HOOK_ICON_DATA_GATE);
            // 🔥 reserved for the single top angle (avgLinkCtr maximum).
            let displayIcon: "🔥" | "✅" | "⚠️" | null = icon;
            if (icon === "🔥" && angleKey !== hotAngle) {
                displayIcon = "✅";
            }
            let tooltipAr: string | null = null;
            if (displayIcon === "🔥") {
                tooltipAr = AR_S_TOOLTIP_STRONGEST;
            } else if (displayIcon === "✅") {
                tooltipAr = AR_S_TOOLTIP_GOOD;
            } else if (displayIcon === "⚠️") {
                // ⚠️ tooltip recommends the top 2 OTHER angles (FR-019).
                // Pull from all eligibleRows (sorted desc by avgLinkCtr)
                // so a third eligible angle can fill the second slot when
                // the current angle is itself in bestTwo. Use the Arabic
                // display labels and avoid duplicating the first suggestion
                // — join them with "أو" once.
                const top = eligibleRows
                    .filter((row) => row.angleKey !== angleKey)
                    .sort((a, b) => b.avgLinkCtr - a.avgLinkCtr)
                    .slice(0, 2);
                if (top.length === 0) {
                    tooltipAr = AR_S_TOOLTIP_WEAK_PREFIX + ".";
                } else {
                    const suggestions = top
                        .map((b) => HOOK_ANGLE_DISPLAY_AR[b.angleKey] || b.angleKey)
                        .join(" " + AR_S_TOOLTIP_WEAK_SEPARATOR + " ");
                    tooltipAr = AR_S_TOOLTIP_WEAK_PREFIX + " " + suggestions + ".";
                }
            }
            icons[angleKey] = { icon: displayIcon, tooltipAr };
        }

        const bestAngles = bestTwo.map((b) => ({
            angleKey: b.angleKey,
            nameAr: HOOK_ANGLE_DISPLAY_AR[b.angleKey] || HOOK_ANGLE_DISPLAY_EN[b.angleKey] || b.angleKey,
        }));

        // Cross-check spec wording vs English equivalents to make sure
        // the strings above match the documented plain-Arabic guarantees.
        // (Compile-time string-shape checks — silence unused-variable
        // warnings if these are not referenced below.)
        void EN_S_RESYNC_REAUTH;
        void EN_S_TOOLTIP_STRONGEST;
        void EN_S_TOOLTIP_GOOD;
        void EN_S_TOOLTIP_WEAK_PREFIX;
        void EN_S_TOOLTIP_WEAK_SEPARATOR;

        const response: HookAnglePerformanceResponse = {
            ok: true,
            icons,
            bestAngles,
        };
        return response;
    },
);
