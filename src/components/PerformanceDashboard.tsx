// src/components/PerformanceDashboard.tsx
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { metaService } from '../services/metaService';
import { useT } from '../i18n';

interface PushedCreative {
    adName: string; productName: string; hookKey: string; conceptIndex: number;
    ratio: string; pushedAt: number; projectId: string;
    hookAngle: string | null; hookType: string | null; adTone: string | null;
    copywritingStrategy: string | null; offerType: string | null;
    creativeMode: string[]; universe: string | null; adFormat: string;
    hookText: string; imageUrl: string | null;
    impressions?: number; clicks?: number; spend?: number;
    ctr?: number; cpc?: number; roas?: number | null;
}

interface FavoriteGen {
    id: string;
    input?: { niche?: string; audience?: string; offer?: string; tone?: string };
    output?: { hookText?: string; captionText?: string; phase?: string };
    feedback?: { rating?: string; savedToFavorites?: boolean };
    timestamp: any;
}

interface DimStats { label: string; count: number; impressions: number; clicks: number; spend: number; avgCtr: number; avgRoas: number; }

type Tab = 'overview' | 'breakdown' | 'creatives' | 'favorites';
type Dim = 'hookAngle' | 'hookType' | 'adTone' | 'copywritingStrategy' | 'offerType' | 'universe' | 'ratio' | 'adFormat' | 'language';

const DIM_LABELS: Record<Dim, { en: string; ar: string }> = {
    hookAngle: { en: 'Hook Angle', ar: 'زاوية العنوان' },
    hookType: { en: 'Hook Type', ar: 'نوع العنوان' },
    adTone: { en: 'Ad Tone', ar: 'نبرة الإعلان' },
    copywritingStrategy: { en: 'Strategy', ar: 'الاستراتيجية' },
    offerType: { en: 'Offer Type', ar: 'نوع العرض' },
    universe: { en: 'Universe / Setting', ar: 'العالم / البيئة' },
    ratio: { en: 'Ad Size', ar: 'حجم الإعلان' },
    adFormat: { en: 'Ad Format', ar: 'شكل الإعلان' },
    language: { en: 'Language', ar: 'اللغة' },
};

export default function PerformanceDashboard({ isOpen, onClose, metaConnected, isDarkMode = true, adAccounts = [], dashboardLevel = 'full', workspaceId = null }: { isOpen: boolean; onClose: () => void; metaConnected: boolean; isDarkMode?: boolean; adAccounts?: { id: string; name: string; currency?: string }[]; dashboardLevel?: 'overview' | 'full'; workspaceId?: string | null }) {
    const { t, lang } = useT();
    const dk = isDarkMode;
    // Theme tokens — vibrant, high-contrast (matching Hook Lab style)
    const txPrimary = dk ? 'text-white' : 'text-slate-900';
    const txSecondary = dk ? 'text-slate-300' : 'text-slate-700';
    const txMuted = dk ? 'text-slate-400' : 'text-slate-500';
    const txFaint = dk ? 'text-slate-500' : 'text-amber-500/70';
    const bgCard = dk ? 'bg-slate-900/60 border border-slate-800/40' : 'bg-white border border-slate-200 shadow-sm';
    const bgChip = dk ? 'bg-blue-600/10 text-blue-400' : 'bg-blue-50 text-blue-700';
    const bgFilterActive = dk ? 'bg-blue-600 text-white border border-blue-500 shadow-lg shadow-blue-600/20' : 'bg-blue-600 text-white border border-blue-500 shadow-sm';
    const bgFilterInactive = dk ? 'bg-slate-900/60 text-slate-400 border border-slate-800/40 hover:text-white hover:bg-slate-800' : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-50';
    const bgSortActive = dk ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white';
    const bgSortInactive = dk ? 'bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:text-slate-900';
    const imgBorder = dk ? 'border-slate-700' : 'border-slate-200';
    const gridHeader = dk ? 'text-slate-500' : 'text-slate-400';
    const rowBg = dk ? 'bg-slate-900/40' : 'bg-slate-50';
    const rowHighlight = dk ? 'bg-emerald-900/15 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200';
    const [tab, setTab] = useState<Tab>('overview');
    const [creatives, setCreatives] = useState<PushedCreative[]>([]);
    const [allCreatives, setAllCreatives] = useState<PushedCreative[]>([]);
    const [favorites, setFavorites] = useState<FavoriteGen[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [dim, setDim] = useState<Dim>('hookAngle');
    const [sortBy, setSortBy] = useState<'ctr' | 'spend' | 'impressions' | 'clicks'>('ctr');
    const [filterAccountId, setFilterAccountId] = useState<string>('all');
    const [breakdownSortCol, setBreakdownSortCol] = useState<'count' | 'impressions' | 'clicks' | 'spend' | 'avgCtr' | 'avgRoas'>('avgCtr');
    const [breakdownSortDir, setBreakdownSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => { if (isOpen) loadData(); }, [isOpen]);

    // Re-filter creatives when account filter changes
    useEffect(() => {
        if (filterAccountId === 'all') {
            setCreatives(allCreatives);
        } else {
            setCreatives(allCreatives.filter(c => (c as any).adAccountId === filterAccountId));
        }
    }, [filterAccountId, allCreatives]);

    const loadData = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        setLoading(true);
        try {
            // Load pushed creatives (legacy) — filter by workspace if provided
            const pcConstraints = [where('userId', '==', uid), orderBy('pushedAt', 'desc'), limit(200)];
            if (workspaceId) pcConstraints.splice(1, 0, where('workspaceId', '==', workspaceId));
            const pcSnap = await getDocs(query(collection(db, 'pushedCreatives'), ...pcConstraints));
            const pushed = pcSnap.docs.map(d => ({ ...d.data() } as PushedCreative));

            // Load deployment records (new — richer metadata)
            let deployments: any[] = [];
            try {
                const depConstraints = [where('userId', '==', uid), orderBy('pushedAt', 'desc'), limit(200)];
                if (workspaceId) depConstraints.splice(1, 0, where('workspaceId', '==', workspaceId));
                const depSnap = await getDocs(query(collection(db, 'creativeDeployments'), ...depConstraints));
                deployments = depSnap.docs.map(d => d.data());
            } catch { /* collection may not exist yet */ }

            // Build deployment lookups — prefer strong identifiers
            const depByMetaAdId = new Map<string, any>();
            const depByImageHash = new Map<string, any>();
            const depByName = new Map<string, any>();
            deployments.forEach(d => {
                if (d.metaAdId) depByMetaAdId.set(d.metaAdId, d);
                if (d.imageHash) depByImageHash.set(d.imageHash, d);
                if (d.adName) depByName.set(d.adName, d);
            });

            // Enrich pushed creatives with deployment metadata — prefer strong ID matches
            const enriched = pushed.map(pc => {
                const dep = ((pc as any).metaAdId && depByMetaAdId.get((pc as any).metaAdId))
                    || ((pc as any).imageHash && depByImageHash.get((pc as any).imageHash))
                    || depByName.get(pc.adName);
                if (dep) {
                    return {
                        ...pc,
                        hookAngle: pc.hookAngle || dep.hookMetadata?.angle || null,
                        hookType: pc.hookType || dep.hookMetadata?.type || null,
                        hookText: pc.hookText || dep.hookMetadata?.text || dep.copySnapshot?.headline || '',
                        language: (pc as any).language || dep.language || null,
                        adAccountId: (pc as any).adAccountId || dep.adAccountId || null,
                        selectedModes: dep.selectedModes || null,
                        contractTemplateId: dep.contractTemplateId || null,
                        _deploymentId: dep.deploymentId || null,
                        _imageHash: dep.imageHash || null,
                    };
                }
                return pc;
            });

            // Load performance data — build lookup by multiple keys
            const perfConstraints: any[] = [where('userId', '==', uid)];
            if (workspaceId) perfConstraints.push(where('workspaceId', '==', workspaceId));
            const perfSnap = await getDocs(query(collection(db, 'adPerformance'), ...perfConstraints));
            const pmById = new Map<string, any>();
            const pmByName = new Map<string, any>();
            perfSnap.docs.forEach(d => { const x = d.data(); if (x.adId) pmById.set(x.adId, x); if (x.adName) pmByName.set(x.adName, x); });

            // Join performance to creatives — prefer metaAdId, then adName fallback
            const joined = enriched.map(pc => {
                const p = (pc as any).metaAdId
                    ? pmById.get((pc as any).metaAdId)
                    : pmByName.get(pc.adName) || null;
                const adAccountId = p?.adAccountId || (pc as any).adAccountId || null;
                return p ? { ...pc, adAccountId, impressions: p.impressions || 0, clicks: p.clicks || 0, spend: p.spend || 0, ctr: p.ctr || 0, cpc: p.cpc || 0, roas: p.roas || null } : { ...pc, adAccountId };
            });
            setAllCreatives(joined);
            // setCreatives will be handled by the filterAccountId useEffect

            // Load favorites
            try {
                const fSnap = await getDocs(query(collection(db, 'generations'), where('userId', '==', uid), where('feedback.savedToFavorites', '==', true), orderBy('timestamp', 'desc'), limit(30)));
                setFavorites(fSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
            } catch {
                // Fallback without composite index
                try {
                    const fallbackSnap = await getDocs(query(collection(db, 'generations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(200)));
                    setFavorites(fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((g: any) => g.feedback?.savedToFavorites === true) as any[]);
                } catch { /* no data */ }
            }
        } catch (e) { console.error('Dashboard load:', e); }
        setLoading(false);
    };

    const handleSync = async () => { setSyncing(true); try { await metaService.syncPerformance(); await loadData(); } catch (e) { } setSyncing(false); };

    const stats = useMemo(() => {
        const wp = creatives.filter(c => (c.impressions || 0) > 0);
        return {
            total: creatives.length, tracked: wp.length,
            impr: wp.reduce((s, c) => s + (c.impressions || 0), 0),
            clicks: wp.reduce((s, c) => s + (c.clicks || 0), 0),
            spend: wp.reduce((s, c) => s + (c.spend || 0), 0),
            avgCtr: wp.length ? wp.reduce((s, c) => s + (c.ctr || 0), 0) / wp.length : 0,
            bestCtr: wp.length ? Math.max(...wp.map(c => c.ctr || 0)) : 0,
            best: wp.sort((a, b) => (b.ctr || 0) - (a.ctr || 0))[0] || null,
        };
    }, [creatives]);

    const breakdown = useMemo((): DimStats[] => {
        const g: Record<string, PushedCreative[]> = {};
        for (const c of creatives) {
            let k = (c as any)[dim];
            if (Array.isArray(k)) k = k.filter((x: string) => x !== 'standard_hero').join(' + ') || 'Standard Hero';
            if (!k) k = lang === 'ar' ? 'غير محدد' : 'Not set';
            if (dim === 'universe' && k.length > 35) k = k.substring(0, 35) + '…';
            (g[k] = g[k] || []).push(c);
        }
        return Object.entries(g).map(([label, items]) => {
            const wp = items.filter(i => (i.impressions || 0) > 0);
            return { label, count: items.length, impressions: wp.reduce((s, i) => s + (i.impressions || 0), 0), clicks: wp.reduce((s, i) => s + (i.clicks || 0), 0), spend: wp.reduce((s, i) => s + (i.spend || 0), 0), avgCtr: wp.length ? wp.reduce((s, i) => s + (i.ctr || 0), 0) / wp.length : 0, avgRoas: wp.length ? wp.reduce((s, i) => s + ((i as any).roas || 0), 0) / wp.length : 0 };
        }).sort((a, b) => breakdownSortDir === 'desc' ? b[breakdownSortCol] - a[breakdownSortCol] : a[breakdownSortCol] - b[breakdownSortCol]);
    }, [creatives, dim, lang, breakdownSortCol, breakdownSortDir]);

    const sorted = useMemo(() => [...creatives].sort((a, b) => sortBy === 'ctr' ? (b.ctr || 0) - (a.ctr || 0) : sortBy === 'spend' ? (b.spend || 0) - (a.spend || 0) : sortBy === 'impressions' ? (b.impressions || 0) - (a.impressions || 0) : (b.clicks || 0) - (a.clicks || 0)), [creatives, sortBy]);

    if (!isOpen) return null;
    const toggleBreakdownSort = (col: typeof breakdownSortCol) => {
        if (breakdownSortCol === col) setBreakdownSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setBreakdownSortCol(col); setBreakdownSortDir('desc'); }
    };
    const sortArrow = (col: typeof breakdownSortCol) => breakdownSortCol === col ? (breakdownSortDir === 'desc' ? ' ▼' : ' ▲') : '';
    const cc = (v: number) => v > 2 ? 'text-emerald-500 font-bold' : v > 1 ? 'text-amber-500 font-bold' : v > 0 ? 'text-red-500' : txFaint;
    const L = (en: string, ar: string) => lang === 'ar' ? ar : en;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className={`${dk ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-2xl'} border rounded-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden`} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-3.5 border-b ${dk ? 'border-slate-800/60' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-1 flex-wrap">
                        {(['overview', 'breakdown', 'creatives', 'favorites'] as Tab[]).map(t => {
                            const isTabLocked = dashboardLevel === 'overview' && (t === 'breakdown' || t === 'creatives');
                            return (
                            <button key={t} onClick={() => { if (!isTabLocked) setTab(t); }} className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all ${isTabLocked ? 'opacity-40 cursor-not-allowed text-slate-600' : tab === t ? (dk ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-blue-600 text-white shadow-sm') : (dk ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-white')}`}>
                                {isTabLocked && <i className="fa-solid fa-lock text-[6px] mr-1"></i>}
                                <i className={`fa-solid ${t === 'overview' ? 'fa-chart-pie' : t === 'breakdown' ? 'fa-filter' : t === 'creatives' ? 'fa-images' : 'fa-star'} mr-1`}></i>
                                {t === 'overview' ? L('Overview', 'نظرة عامة') : t === 'breakdown' ? L('Breakdown', 'تحليل') : t === 'creatives' ? L('Creatives', 'الإعلانات') : L('Favorites', 'المفضلة')}
                            </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        {adAccounts.length > 1 && (
                            <select
                                value={filterAccountId}
                                onChange={e => setFilterAccountId(e.target.value)}
                                className={`text-[9px] font-bold px-2 py-1.5 rounded-lg border outline-none cursor-pointer ${dk ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                            >
                                <option value="all">{L('All Accounts', 'كل الحسابات')}</option>
                                {adAccounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}{a.currency ? ` (${a.currency})` : ''}</option>
                                ))}
                            </select>
                        )}
                        {metaConnected && <button onClick={handleSync} disabled={syncing} className="px-2.5 py-1.5 bg-blue-600/10 text-blue-400 text-[8px] font-bold rounded-lg hover:bg-blue-600/20 disabled:opacity-50"><i className={`fa-solid ${syncing ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'} mr-1`}></i>{syncing ? L('Syncing…', 'مزامنة…') : L('Sync', 'مزامنة')}</button>}
                        <button onClick={onClose} className={`w-7 h-7 rounded-lg ${dk ? 'bg-slate-900' : 'bg-slate-100'} flex items-center justify-center ${dk ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}><i className="fa-solid fa-xmark text-xs"></i></button>
                    </div>
                </div>

                <div className="overflow-y-auto max-h-[calc(85vh-56px)] p-5 pt-8">
                    {loading && <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div></div>}

                    {!loading && creatives.length === 0 && tab !== 'favorites' && (
                        <div className="text-center py-16 space-y-3">
                            <i className={`fa-solid fa-chart-line text-4xl ${dk ? 'text-slate-700' : 'text-slate-300'}`}></i>
                            <p className={`text-sm ${dk ? 'text-slate-500' : 'text-slate-600'}`}>{L('No performance data yet', 'لا توجد بيانات أداء بعد')}</p>
                            <p className={`text-[10px] ${dk ? 'text-slate-600' : 'text-slate-500'} max-w-sm mx-auto`}>{L('Push ads to Meta from Step 4, then click Sync', 'ادفع إعلاناتك لميتا من الخطوة 4 ثم اضغط مزامنة')}</p>
                        </div>
                    )}

                    {/* ═══ OVERVIEW ═══ */}
                    {!loading && tab === 'overview' && creatives.length > 0 && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                                {[
                                    { v: stats.total, l: L('Ads Pushed', 'إعلانات'), c: txPrimary },
                                    { v: stats.impr.toLocaleString(), l: L('Impressions', 'ظهور'), c: txPrimary },
                                    { v: stats.clicks.toLocaleString(), l: L('Clicks', 'نقرات'), c: txPrimary },
                                    { v: stats.avgCtr.toFixed(2) + '%', l: L('Avg CTR', 'متوسط CTR'), c: cc(stats.avgCtr) },
                                    { v: '$' + stats.spend.toFixed(0), l: L('Spend', 'إنفاق'), c: 'text-amber-400' },
                                ].map((k, i) => (
                                    <div key={i} data-light-ctx="dash-stat" className={`${dk ? 'bg-slate-900/60' : 'bg-slate-50 border border-slate-200'} rounded-xl p-3 text-center`}>
                                        <div className={`text-xl font-black ${k.c}`}>{k.v}</div>
                                        <div className={`text-[7px] ${dk ? 'text-slate-500' : 'text-slate-600'} uppercase tracking-wider mt-0.5`}>{k.l}</div>
                                    </div>
                                ))}
                            </div>

                            {stats.best && (stats.best.ctr || 0) > 0 && (
                                <div className={`${dk ? 'bg-gradient-to-r from-emerald-900/20 to-slate-900/40 border-emerald-500/10' : 'bg-emerald-50/80 border-emerald-200'} rounded-xl p-4 border`}>
                                    <div className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider mb-2"><i className="fa-solid fa-trophy mr-1"></i>{L('Best Performing Ad', 'أفضل إعلان أداءً')}</div>
                                    <div className="flex items-center gap-3">
                                        {stats.best.imageUrl && <img src={stats.best.imageUrl} className={`w-14 h-14 rounded-lg object-cover border ${imgBorder} shrink-0`} />}
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-[11px] ${txPrimary} font-bold truncate`}>{stats.best.adName}</div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {stats.best.hookAngle && <span className="text-[7px] bg-blue-600/10 text-blue-400 px-1.5 py-0.5 rounded">{stats.best.hookAngle}</span>}
                                                {stats.best.hookType && <span className="text-[7px] bg-violet-600/10 text-violet-400 px-1.5 py-0.5 rounded">{stats.best.hookType}</span>}
                                                {stats.best.adTone && <span className="text-[7px] bg-emerald-600/10 text-emerald-400 px-1.5 py-0.5 rounded">{stats.best.adTone}</span>}
                                                {stats.best.offerType && <span className="text-[7px] bg-amber-600/10 text-amber-400 px-1.5 py-0.5 rounded">{stats.best.offerType}</span>}
                                                {stats.best.copywritingStrategy && <span className="text-[7px] bg-pink-600/10 text-pink-400 px-1.5 py-0.5 rounded">{stats.best.copywritingStrategy.replace(/_/g, ' ')}</span>}
                                            </div>
                                            {stats.best.hookText && <div dir="rtl" className={`text-[9px] ${txSecondary} mt-1 truncate arabic-text`}>{stats.best.hookText}</div>}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-xl font-black ${cc(stats.best.ctr || 0)}`}>{(stats.best.ctr || 0).toFixed(2)}%</div>
                                            <div className={`text-[7px] ${txMuted}`}>CTR</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className={`text-[8px] ${txMuted} font-bold uppercase tracking-wider mb-2`}>{L('Top by Hook Angle', 'الأعلى حسب زاوية العنوان')}</div>
                                <div className="space-y-1">
                                    {breakdown.filter(b => b.label !== (lang === 'ar' ? 'غير محدد' : 'Not set')).slice(0, 5).map(b => (
                                        <div key={b.label} className={`flex items-center gap-2 ${bgCard} rounded-lg px-3 py-1.5`}>
                                            <span className={`text-[9px] ${txPrimary} font-bold w-28 truncate`}>{b.label}</span>
                                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (b.avgCtr / Math.max(stats.bestCtr, 0.01)) * 100)}%` }}></div></div>
                                            <span className={`text-[9px] font-bold w-12 text-right ${cc(b.avgCtr)}`}>{b.avgCtr.toFixed(2)}%</span>
                                            <span className={`text-[8px] ${txFaint} w-8 text-right`}>{b.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ BREAKDOWN ═══ */}
                    {!loading && tab === 'breakdown' && creatives.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-1">
                                {(Object.keys(DIM_LABELS) as Dim[]).map(d => (
                                    <button key={d} onClick={() => setDim(d)} className={`px-2.5 py-1.5 rounded-lg text-[8px] font-bold transition-all ${dim === d ? bgFilterActive : bgFilterInactive}`}>
                                        {lang === 'ar' ? DIM_LABELS[d].ar : DIM_LABELS[d].en}
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-1.5">
                                <div className={`grid grid-cols-[1fr,40px,65px,50px,55px,55px,55px] gap-1.5 text-[7px] ${gridHeader} uppercase tracking-wider px-3`}>
                                    <span>{lang === 'ar' ? DIM_LABELS[dim].ar : DIM_LABELS[dim].en}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('count')}>#{sortArrow('count')}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('impressions')}>{L('Impr.', 'ظهور')}{sortArrow('impressions')}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('clicks')}>{L('Clicks', 'نقرات')}{sortArrow('clicks')}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('spend')}>{L('Spend', 'إنفاق')}{sortArrow('spend')}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('avgCtr')}>CTR{sortArrow('avgCtr')}</span>
                                    <span className="text-right cursor-pointer select-none hover:text-white" onClick={() => toggleBreakdownSort('avgRoas')}>ROAS{sortArrow('avgRoas')}</span>
                                </div>
                                {breakdown.map((r, i) => (
                                    <div key={r.label} className={`grid grid-cols-[1fr,40px,65px,50px,55px,55px,55px] gap-1.5 items-center px-3 py-2 rounded-lg ${i === 0 && r.avgCtr > 0 ? rowHighlight : rowBg}`}>
                                        <span className={`text-[9px] ${txPrimary} font-bold truncate flex items-center gap-1`}>{i === 0 && r.avgCtr > 0 && <i className="fa-solid fa-trophy text-[7px] text-emerald-400"></i>}{r.label}</span>
                                        <span className={`text-[9px] ${txSecondary} text-right`}>{r.count}</span>
                                        <span className={`text-[9px] ${txSecondary} text-right`}>{r.impressions.toLocaleString()}</span>
                                        <span className={`text-[9px] ${txSecondary} text-right`}>{r.clicks}</span>
                                        <span className={`text-[9px] ${txSecondary} text-right`}>${r.spend.toFixed(0)}</span>
                                        <span className={`text-[9px] font-bold text-right ${cc(r.avgCtr)}`}>{r.avgCtr.toFixed(2)}%</span>
                                        <span className={`text-[9px] font-bold text-right ${r.avgRoas > 2 ? 'text-emerald-500' : r.avgRoas > 1 ? 'text-amber-500' : r.avgRoas > 0 ? 'text-red-500' : txFaint}`}>{r.avgRoas > 0 ? r.avgRoas.toFixed(2) + 'x' : '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══ CREATIVES ═══ */}
                    {!loading && tab === 'creatives' && creatives.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex gap-1">{(['ctr', 'spend', 'impressions', 'clicks'] as const).map(s => (
                                <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-1 rounded text-[8px] font-bold uppercase ${sortBy === s ? bgSortActive : bgSortInactive}`}>{s === 'ctr' ? 'CTR' : s[0].toUpperCase() + s.slice(1)}</button>
                            ))}</div>
                            <div className="space-y-1.5">{sorted.map((ad, i) => (
                                <div key={`${ad.adName}-${i}`} data-light-ctx="dash-item" className={`${dk ? 'bg-slate-900/40 hover:bg-slate-900/60' : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'} rounded-xl p-3 transition-all`}>
                                    <div className="flex items-start gap-3">
                                        {ad.imageUrl && <img src={ad.imageUrl} className={`w-12 h-12 rounded-lg object-cover border ${imgBorder} shrink-0`} />}
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-[10px] ${txPrimary} font-bold truncate`}>{ad.adName}</div>
                                            {ad.hookText && <div dir="rtl" className={`text-[8px] ${txSecondary} truncate mt-0.5 arabic-text`}>{ad.hookText}</div>}
                                            <div className="flex flex-wrap gap-0.5 mt-1">
                                                {ad.hookAngle && <span className="text-[6px] font-bold bg-blue-600/10 text-blue-400 px-1 py-0.5 rounded">{ad.hookAngle}</span>}
                                                {ad.hookType && <span className="text-[6px] font-bold bg-violet-600/10 text-violet-400 px-1 py-0.5 rounded">{ad.hookType}</span>}
                                                {ad.adTone && <span className="text-[6px] font-bold bg-emerald-600/10 text-emerald-400 px-1 py-0.5 rounded">{ad.adTone}</span>}
                                                {ad.copywritingStrategy && <span className="text-[6px] font-bold bg-amber-600/10 text-amber-400 px-1 py-0.5 rounded">{ad.copywritingStrategy.replace(/_/g, ' ')}</span>}
                                                {ad.offerType && <span className="text-[6px] font-bold bg-pink-600/10 text-pink-400 px-1 py-0.5 rounded">{ad.offerType}</span>}
                                                <span className={`text-[6px] font-bold ${bgChip} px-1 py-0.5 rounded`}>{ad.ratio}</span>
                                                {ad.universe && <span className={`text-[6px] ${txFaint} truncate max-w-[100px]`}>{ad.universe}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 text-[9px]">
                                            {(ad.impressions || 0) > 0 ? <>
                                                <div className="text-center"><div className={`font-bold ${cc(ad.ctr || 0)}`}>{(ad.ctr || 0).toFixed(2)}%</div><div className={`text-[6px] ${txFaint}`}>CTR</div></div>
                                                <div className="text-center"><div className={`font-bold ${txSecondary}`}>{(ad.impressions || 0).toLocaleString()}</div><div className={`text-[6px] ${txFaint}`}>{L('Impr', 'ظهور')}</div></div>
                                                <div className="text-center"><div className={`font-bold ${txSecondary}`}>${(ad.spend || 0).toFixed(2)}</div><div className={`text-[6px] ${txFaint}`}>{L('Spend', 'إنفاق')}</div></div>
                                            </> : <span className={`text-[7px] ${txFaint} italic`}>{L('Awaiting data', 'في انتظار البيانات')}</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}</div>
                        </div>
                    )}

                    {/* ═══ FAVORITES ═══ */}
                    {!loading && tab === 'favorites' && (
                        <div className="space-y-3">
                            {favorites.length === 0 && (
                                <div className="text-center py-16 space-y-3">
                                    <i className="fa-solid fa-star text-4xl text-slate-700"></i>
                                    <p className={`text-sm ${txMuted}`}>{L('No favorites yet', 'لا توجد مفضلة بعد')}</p>
                                    <p className={`text-[10px] ${txFaint}`}>{L('Click ⭐ on any hook, image, or caption to save it', 'اضغط ⭐ على أي عنوان أو صورة أو نص للحفظ')}</p>
                                </div>
                            )}
                            {favorites.map(f => (
                                <div key={f.id} data-light-ctx="dash-item" className={`${dk ? 'bg-slate-900/40 hover:bg-slate-900/60' : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'} rounded-xl p-3 transition-all`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded ${f.output?.phase === 'hooks' ? 'bg-blue-500/15 text-blue-400' : f.output?.phase === 'render' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-purple-500/15 text-purple-400'}`}>
                                                {f.output?.phase === 'hooks' ? L('Hook', 'عنوان') : f.output?.phase === 'render' ? L('Design', 'تصميم') : L('Caption', 'نص')}
                                            </span>
                                            {f.input?.tone && <span className={`text-[7px] ${txFaint}`}>{f.input.tone}</span>}
                                            {f.feedback?.rating === 'used' && <span className="text-[7px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded"><i className="fa-solid fa-rocket mr-0.5"></i>{L('Used', 'مُستخدم')}</span>}
                                        </div>
                                        <span className={`text-[7px] ${txFaint}`}>{f.timestamp?.toDate ? new Date(f.timestamp.toDate()).toLocaleDateString() : ''}</span>
                                    </div>
                                    {f.output?.hookText && <div dir="rtl" className={`arabic-text text-sm ${txPrimary} font-bold leading-relaxed`}>{f.output.hookText}</div>}
                                    {f.output?.captionText && <div dir="rtl" className={`arabic-text text-[9px] ${txSecondary} leading-relaxed line-clamp-2 mt-1`}>{f.output.captionText}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}