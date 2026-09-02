// src/components/WhatsWorkingDashboard.tsx
// Phase 14 Layer 5 — "What's Working" Dashboard.
// ARABIC COPY: all user-visible strings route through useT() per
// project guidelines. NO technical terms in any returned UI text —
// no "متوسط"/"ميديان"/"CTR"/"CPM"/"CPA"/percentages anywhere.
// The component loads all dashboard data from a single backend
// callable (getWhatsWorkingDashboard) and renders 6 sections.

import React, { useEffect, useMemo, useState } from "react";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { useT } from "../i18n";

// ─── Backend response types (mirror getWhatsWorkingDashboard) ───

interface SyncStatus {
    lastMetaSyncAt: number | null;
    nextScheduledSyncAt: number | null;
    connection: "connected" | "disconnected" | "needs_reauth";
    canSyncNow: boolean;
    cooldownEndsAt: number | null;
}

interface Summary {
    // FIX 2 (dashboard-polish): spend now covers the last 7 days (display
    // only — verdicts still use the internal 3-day window).
    spend7dLabel: string;
    totalSpend7d?: number;
    currency?: string;
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

interface RecentVerdict {
    adName: string;
    emoji: string;
    descriptionAr: string;
    at: number;
}

interface OtherObjectiveAd {
    adId: string;
    adName: string;
    verdictEmoji: string;
}

interface DashboardData {
    syncStatus: SyncStatus;
    summary: Summary;
    strongestAngles: StrongestAngle[];
    strongestVisuals: StrongestVisual[];
    unmatchedAds: UnmatchedAd[];
    otherObjectiveAds?: OtherObjectiveAd[];
    recentVerdicts: RecentVerdict[];
}

// ─── Helpers ───────────────────────────────────────────────────

function relativeTime(ts: number, lang: "en" | "ar", t: (key: string, vars?: Record<string, string | number>) => string): string {
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (minutes < 1) return t("whats_working.sync.last_just_now");
    if (minutes < 60) return t("whats_working.sync.last_minutes_ago", { n: minutes });
    if (hours < 24) return t("whats_working.sync.last_hours_ago", { n: hours });
    return t("whats_working.sync.last_days_ago", { n: days });
}

function relativeTimeLong(ts: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (minutes < 1) return t("whats_working.recent.relative_now");
    if (minutes < 60) return t("whats_working.recent.relative_minutes", { n: minutes });
    if (hours < 24) return t("whats_working.recent.relative_hours", { n: hours });
    return t("whats_working.recent.relative_days", { n: days });
}

// ─── Section A — Sync status ──────────────────────────────────

function SyncStatusBar(props: {
    status: SyncStatus;
    onSync: () => void;
    onReconnect: () => void;
    onConnect: () => void;
}): React.ReactElement {
    const { t, lang } = useT();
    const { status } = props;

    if (status.connection === "needs_reauth") {
        return (
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-2xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <i className="fa-solid fa-circle-exclamation text-amber-400 text-xl" />
                    <div>
                        <div className="text-amber-300 text-sm font-bold">
                            {t("whats_working.sync.needs_reauth")}
                        </div>
                    </div>
                </div>
                <button
                    onClick={props.onReconnect}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
                >
                    {t("whats_working.sync.reconnect_cta")}
                </button>
            </div>
        );
    }

    if (status.connection === "disconnected") {
        return (
            <div className="bg-slate-900/40 border border-slate-700/40 rounded-2xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <i className="fa-solid fa-plug-circle-xmark text-slate-500 text-xl" />
                    <div>
                        <div className="text-slate-300 text-sm font-bold">
                            {t("whats_working.sync.never_connected")}
                        </div>
                    </div>
                </div>
                <button
                    onClick={props.onConnect}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
                >
                    {t("whats_working.sync.connect_cta")}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-2xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <i className="fa-solid fa-rotate text-blue-400 text-xl" />
                <div>
                    <div className="text-slate-200 text-sm font-bold">
                        {status.lastMetaSyncAt
                            ? relativeTime(status.lastMetaSyncAt, lang, t)
                            : t("whats_working.sync.never")}
                    </div>
                </div>
            </div>
            <button
                onClick={props.onSync}
                disabled={!status.canSyncNow}
                className={`text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors ${
                    status.canSyncNow
                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
            >
                {status.canSyncNow
                    ? t("whats_working.sync.cta")
                    : t("whats_working.sync.cooldown")}
            </button>
        </div>
    );
}

// ─── Section B — Summary strip ─────────────────────────────────

function SummaryStrip({ summary }: { summary: Summary }): React.ReactElement {
    const { t } = useT();
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
                icon="fa-coins"
                label={t("whats_working.summary.spend_label")}
                value={summary.spend7dLabel}
            />
            <SummaryCard
                icon="fa-bullseye"
                label={t("whats_working.summary.matched_of_total", {
                    matched: summary.matchedAds,
                    total: summary.totalAds,
                })}
                value={`${summary.matchedAds} / ${summary.totalAds}`}
            />
            <SummaryCard
                icon="fa-scale-balanced"
                label={t("dashboard.title")}
                value={
                    <span className="flex items-center gap-2 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                            🟢 {summary.green}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                            🟡 {summary.yellow}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">
                            🔴 {summary.red}
                        </span>
                    </span>
                }
            />
        </div>
    );
}

function SummaryCard(props: { icon: string; label: string; value: React.ReactNode }): React.ReactElement {
    return (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-2xl px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <i className={`fa-solid ${props.icon} text-blue-400`} />
                <span>{props.label}</span>
            </div>
            <div className="text-slate-100 text-sm font-bold">{props.value}</div>
        </div>
    );
}

// ─── Sections C & D — Strongest angles / visuals ───────────────

function StrongestList<T extends StrongestAngle | StrongestVisual>(props: {
    title: string;
    subtitle: string;
    items: T[];
    emptyText: string;
    renderItem: (item: T) => React.ReactNode;
}): React.ReactElement {
    return (
        <div className="space-y-3">
            <div>
                <div className="text-slate-100 text-sm font-bold">{props.title}</div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider">{props.subtitle}</div>
            </div>
            {props.items.length === 0 ? (
                <div className="text-slate-500 text-xs italic px-2">{props.emptyText}</div>
            ) : (
                <div className="space-y-1.5">{props.items.map((item, idx) => (
                    <div key={idx}>{props.renderItem(item)}</div>
                ))}</div>
            )}
        </div>
    );
}

function AngleRow({ item }: { item: StrongestAngle }): React.ReactElement {
    return (
        <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="text-slate-100 text-xs font-bold">{item.nameAr}</span>
            </div>
            <span className="text-slate-400 text-[10px]">{item.countAr}</span>
        </div>
    );
}

function VisualRow({ item }: { item: StrongestVisual }): React.ReactElement {
    return (
        <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="text-slate-100 text-xs font-bold">{item.descriptionAr}</span>
            </div>
            <span className="text-slate-400 text-[10px]">{item.countAr}</span>
        </div>
    );
}

// ─── Section E — Unmatched ads ────────────────────────────────

function UnmatchedAdsList(props: {
    items: UnmatchedAd[];
    onLink: (ad: UnmatchedAd) => void;
}): React.ReactElement {
    const { t } = useT();
    return (
        <div className="space-y-3">
            <div className="text-slate-100 text-sm font-bold">
                {t("whats_working.unmatched.title")}
            </div>
            {props.items.length === 0 ? (
                <div className="text-slate-500 text-xs italic px-2">
                    {t("whats_working.unmatched.empty")}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {props.items.map((ad) => (
                        <div key={ad.adId} className="bg-slate-900/30 border border-slate-800/40 rounded-xl px-3 py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                {ad.thumbnailUrl ? (
                                    <img
                                        src={ad.thumbnailUrl}
                                        alt=""
                                        className="w-10 h-10 object-cover rounded-md border border-slate-800 shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-md bg-slate-800 border border-slate-700 shrink-0" />
                                )}
                                <span className="text-slate-200 text-xs font-bold truncate">
                                    {ad.adName}
                                </span>
                            </div>
                            <button
                                onClick={() => props.onLink(ad)}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors shrink-0"
                            >
                                {t("whats_working.unmatched.link_cta")}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Section F — Recent verdicts ──────────────────────────────

function RecentVerdictsList({ items }: { items: RecentVerdict[] }): React.ReactElement {
    const { t } = useT();
    return (
        <div className="space-y-3">
            <div className="text-slate-100 text-sm font-bold">
                {t("whats_working.recent.title")}
            </div>
            {items.length === 0 ? (
                <div className="text-slate-500 text-xs italic px-2">
                    {t("whats_working.recent.empty")}
                </div>
            ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {items.map((v, idx) => (
                        <div key={idx} className="bg-slate-900/30 border border-slate-800/40 rounded-xl px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-base shrink-0">{v.emoji}</span>
                                    <span className="text-slate-200 text-xs font-bold truncate">
                                        {v.adName}
                                    </span>
                                </div>
                                <span className="text-slate-500 text-[10px] shrink-0">
                                    {relativeTimeLong(v.at, t)}
                                </span>
                            </div>
                            <div className="text-slate-400 text-[11px] mt-1.5">
                                {v.descriptionAr}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main dashboard ──────────────────────────────────────────

export interface WhatsWorkingDashboardProps {
    workspaceId: string;
    accountId: string;
    onSyncNow: () => Promise<void>;
    onReconnect: () => void;
    onConnect: () => void;
    onLinkAd: (ad: UnmatchedAd) => void;
    onClose: () => void;
}

export function WhatsWorkingDashboard(props: WhatsWorkingDashboardProps): React.ReactElement {
    const { t } = useT();
    const [data, setData] = useState<DashboardData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useMemo(() => async () => {
        setLoading(true);
        setError(null);
        try {
            const fn = httpsCallable(functions, "getWhatsWorkingDashboard");
            const res = await fn({ workspaceId: props.workspaceId, accountId: props.accountId });
            setData(res.data as DashboardData);
        } catch (e) {
            // The user still sees a plain-language message (never the raw
            // error), but the error MUST reach the console — discarding it
            // with `void e` is what hid a 404 caller-scope failure behind a
            // message indistinguishable from "no data yet".
            console.error(
                "[WhatsWorkingDashboard] getWhatsWorkingDashboard failed",
                { workspaceId: props.workspaceId, accountId: props.accountId },
                e,
            );
            setError(t("whats_loading.error"));
        } finally {
            setLoading(false);
        }
    }, [props.workspaceId, props.accountId, t]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    if (loading) {
        return (
            <div className="bg-slate-950/60 backdrop-blur rounded-2xl border border-slate-800/40 p-10 text-center text-slate-400">
                {t("whats_loading.loading")}
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-950/60 backdrop-blur rounded-2xl border border-red-500/30 p-10 text-center">
                <i className="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2" />
                <div className="text-red-300 text-sm">{error}</div>
            </div>
        );
    }

    if (!data) {
        // Distinct from the error branch above: the call SUCCEEDED and
        // simply carried no data. Same string for both is what made a
        // hard failure look like an empty account.
        return <div className="text-slate-400 text-sm p-6">{t("whats_loading.empty")}</div>;
    }

    return (
        <div className="space-y-6">
            <SyncStatusBar
                status={data.syncStatus}
                // FIX 1 (dashboard-polish): after the sync finishes, re-fetch
                // the dashboard so freshly-synced data (last-synced time,
                // verdicts, spend) appears without a manual reload.
                onSync={() => { void (async () => { await props.onSyncNow(); await fetchData(); })(); }}
                onReconnect={props.onReconnect}
                onConnect={props.onConnect}
            />
            <SummaryStrip summary={data.summary} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-950/40 backdrop-blur rounded-2xl border border-slate-800/40 p-5">
                    <StrongestList
                        title={t("whats_working.angles.title")}
                        subtitle={t("whats_working.angles.subtitle")}
                        items={data.strongestAngles}
                        emptyText={t("whats_working.angles.empty")}
                        renderItem={(item) => <AngleRow item={item as StrongestAngle} />}
                    />
                </div>
                <div className="bg-slate-950/40 backdrop-blur rounded-2xl border border-slate-800/40 p-5">
                    <StrongestList
                        title={t("whats_working.visuals.title")}
                        subtitle={t("whats_working.visuals.subtitle")}
                        items={data.strongestVisuals}
                        emptyText={t("whats_working.visuals.empty")}
                        renderItem={(item) => <VisualRow item={item as StrongestVisual} />}
                    />
                </div>
            </div>
            <div className="bg-slate-950/40 backdrop-blur rounded-2xl border border-slate-800/40 p-5">
                <UnmatchedAdsList
                    items={data.unmatchedAds}
                    onLink={props.onLinkAd}
                />
            </div>
            <div className="bg-slate-950/40 backdrop-blur rounded-2xl border border-slate-800/40 p-5">
                <RecentVerdictsList items={data.recentVerdicts} />
            </div>
        </div>
    );
}

// Default export — lets `React.lazy(() => import("./WhatsWorkingDashboard"))`
// resolve the component as the module's default export (matches the
// pattern used by FunnelSettingsForm / MetaAccountPickerModal).
export default WhatsWorkingDashboard;
