// src/components/FunnelSettingsForm.tsx
// ═══════════════════════════════════════════════════════════
// Phase 14 — Layer 1 (US1) Funnel Settings form. The single source of
// truth for funnel economics per workspace-account.
//
// BEHAVIOR (spec §2.1–§2.6):
//   - Workspace-name header.
//   - Field 1 = funnel-type dropdown (4 closed values).
//   - Conditional fields per funnel-type (paid: AOV/Has-HTO→price+rate/
//     ROAS; free_webinar: offerPrice/attendance/buyRate; lead_magnet_call:
//     offerPrice/leadToCloseRate).
//   - Results card: derived target + max + (free) leadValue.
//   - Cap warning card (when derived.capApplied).
//   - Business Advisory Cards (spec §2.6) — non-blocking, dismissible per
//     card with persisted `advisoriesDismissed.{noHto,lowValue}`.
//   - Monthly-review prompt (when `reviewDue`).
//   - "احجز مكالمة" CTA opens https://eslamsalah.com/team-discovery-call in
//     a new tab.
//
// ARABIC COPY: all user-visible strings are English/Fusha, no forbidden
// terms (SC-11 lint passes via scripts/sc11Guard.mjs).
//
// DATA: `useFunnelSettings(workspaceId, accountId)` hook loads + saves.
// The hook reads from + writes to `saveFunnelSettings` / `getFunnelSettings`
// / `dismissAdvisory` callables (Phase 14 backend).
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// ─── Types (mirror functions/src/funnelSettings.ts contract) ─

export type FunnelType = 'paid_event' | 'paid_product' | 'free_webinar' | 'lead_magnet_call';
export type RoasTarget = 1.0 | 0.65 | 0.5;

export interface DerivedTargets {
    paid?: {
        rawTargetCpa: number;
        fullBuyerValue: number;
        maxCpa: number;
        effectiveTargetCpa: number;
        capApplied: boolean;
    };
    free?: {
        leadValue: number;
        economicCeilingCpl: number;
        effectiveTargetCpl: number;
    };
    computedAt: number;
}

export interface Advisories {
    noHto: boolean;
    lowValue: boolean;
}

export interface FunnelSettingsDoc {
    accountId: string;
    funnelType: FunnelType;
    aov: number | null;
    hasHto: boolean;
    htoPrice: number;
    htoConversionRate: number;
    roasTarget: RoasTarget;
    offerPrice: number | null;
    attendanceRate: number | null;
    buyRateFromAttendees: number | null;
    leadToCloseRate: number | null;
    derived: DerivedTargets;
    advisories: Advisories;
    advisoriesDismissed: { noHto: boolean; lowValue: boolean };
    lastReviewedAt: number;
    reviewDueAt: number;
}

export interface FunnelSettingsFormProps {
    workspaceId: string | null;
    accountId: string | null;
    workspaceName?: string;
    isDarkMode?: boolean;
    /** Called after a successful save — parent may close the form or refresh data. */
    onSaved?: (settings: FunnelSettingsDoc) => void;
}

const TEAM_DISCOVERY_URL = 'https://eslamsalah.com/team-discovery-call';

// ─── Hook: load + save + dismiss ─────────────────────────────

interface UseFunnelSettingsReturn {
    loading: boolean;
    error: string | null;
    settings: FunnelSettingsDoc | null;
    reviewDue: boolean;
    save: (req: Omit<SaveFunnelSettingsRequest, 'clientNowMs'> & { clientNowMs?: number }) => Promise<void>;
    dismiss: (key: 'noHto' | 'lowValue', dismissed: boolean) => Promise<void>;
}

interface SaveFunnelSettingsRequest {
    workspaceId: string;
    accountId: string;
    funnelType: FunnelType;
    aov?: number | null;
    hasHto?: boolean;
    htoPrice?: number;
    htoConversionRate?: number;
    roasTarget?: RoasTarget;
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    clientNowMs: number;
}

interface SaveFunnelSettingsResponse {
    ok: true;
    derived: DerivedTargets;
    advisories: Advisories;
    reviewDueAt: number;
    warning?: { code: 'CPA_CAP_APPLIED'; messageAr: string; rawTargetCpa: number; cappedTo: number };
}

function useFunnelSettings(workspaceId: string | null, accountId: string | null): UseFunnelSettingsReturn {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [settings, setSettings] = useState<FunnelSettingsDoc | null>(null);
    const [reviewDue, setReviewDue] = useState(false);

    useEffect(() => {
        if (!workspaceId || !accountId) {
            setSettings(null);
            setReviewDue(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        const fn = httpsCallable(functions, 'getFunnelSettings');
        fn({ workspaceId, accountId })
            .then((res) => {
                if (cancelled) return;
                const data = res.data as { ok: true; settings: FunnelSettingsDoc | null; reviewDue: boolean };
                setSettings(data.settings);
                setReviewDue(!!data.reviewDue);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(typeof e?.message === 'string' ? e.message : 'Failed to load funnel settings.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId, accountId]);

    const save = async (req: Omit<SaveFunnelSettingsRequest, 'clientNowMs'> & { clientNowMs?: number }): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const fn = httpsCallable(functions, 'saveFunnelSettings');
            const res = await fn({ ...req, clientNowMs: req.clientNowMs ?? Date.now() });
            const data = res.data as SaveFunnelSettingsResponse;
            // Optimistic merge — server is authoritative but we don't get the
            // full doc back. Construct a minimal doc so the form can re-render.
            const next: FunnelSettingsDoc = {
                accountId: req.accountId,
                funnelType: req.funnelType,
                aov: req.aov ?? null,
                hasHto: req.hasHto === true,
                htoPrice: req.hasHto ? (req.htoPrice ?? 0) : 0,
                htoConversionRate: req.hasHto ? (req.htoConversionRate ?? 0) : 0,
                roasTarget: req.roasTarget ?? 1.0,
                offerPrice: req.offerPrice ?? null,
                attendanceRate: req.attendanceRate ?? null,
                buyRateFromAttendees: req.buyRateFromAttendees ?? null,
                leadToCloseRate: req.leadToCloseRate ?? null,
                derived: data.derived,
                advisories: data.advisories,
                advisoriesDismissed: settings?.advisoriesDismissed ?? { noHto: false, lowValue: false },
                lastReviewedAt: req.clientNowMs ?? Date.now(),
                reviewDueAt: data.reviewDueAt,
            };
            setSettings(next);
            setReviewDue(false); // a fresh review just happened
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message ?? 'Failed to save funnel settings.';
            setError(msg);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const dismiss = async (key: 'noHto' | 'lowValue', dismissed: boolean): Promise<void> => {
        if (!workspaceId || !accountId) return;
        try {
            const fn = httpsCallable(functions, 'dismissAdvisory');
            await fn({ workspaceId, accountId, advisoryKey: key, dismissed });
            setSettings((prev) => prev ? {
                ...prev,
                advisoriesDismissed: { ...prev.advisoriesDismissed, [key]: dismissed },
            } : prev);
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message ?? 'Failed to update advisory.';
            setError(msg);
        }
    };

    return { loading, error, settings, reviewDue, save, dismiss };
}

// ─── Form component ──────────────────────────────────────────

const FUNNEL_LABELS: Record<FunnelType, { ar: string; en: string }> = {
    paid_event: { ar: 'فعالية مدفوعة', en: 'Paid Event' },
    paid_product: { ar: 'منتج مدفوع', en: 'Paid Product' },
    free_webinar: { ar: 'ويبينار مجاني', en: 'Free Webinar' },
    lead_magnet_call: { ar: 'مغناطيس عملاء محتمل + مكالمة', en: 'Lead Magnet → Call' },
};

const ROAS_OPTIONS: Array<{ value: RoasTarget; label: string; sub: string }> = [
    { value: 1.0, label: '1.0 — توازن', sub: 'استراداد التكلفة فقط' },
    { value: 0.65, label: '0.65 — استثمار معتدل', sub: 'تقبل خسارة بسيطة مقابل بيانات' },
    { value: 0.5, label: '0.5 — استثمار أعلى', sub: 'تقبل خسارة أكبر مقابل بيانات أكثر' },
];

export default function FunnelSettingsForm({
    workspaceId,
    accountId,
    workspaceName,
    isDarkMode = true,
    onSaved,
}: FunnelSettingsFormProps) {
    const dk = isDarkMode;
    const txPrimary = dk ? 'text-white' : 'text-slate-900';
    const txSecondary = dk ? 'text-slate-300' : 'text-slate-700';
    const txMuted = dk ? 'text-slate-400' : 'text-slate-500';
    const cardBg = dk ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';

    const { loading, error, settings, reviewDue, save, dismiss } = useFunnelSettings(workspaceId, accountId);

    // Form state
    const [funnelType, setFunnelType] = useState<FunnelType>('paid_event');
    const [aov, setAov] = useState<string>('');
    const [hasHto, setHasHto] = useState<boolean>(false);
    const [htoPrice, setHtoPrice] = useState<string>('');
    const [htoConversionRate, setHtoConversionRate] = useState<string>('');
    const [roasTarget, setRoasTarget] = useState<RoasTarget>(1.0);
    const [offerPrice, setOfferPrice] = useState<string>('');
    const [attendanceRate, setAttendanceRate] = useState<string>('');
    const [buyRateFromAttendees, setBuyRateFromAttendees] = useState<string>('');
    const [leadToCloseRate, setLeadToCloseRate] = useState<string>('');

    // Hydrate form from loaded settings
    useEffect(() => {
        if (!settings) return;
        setFunnelType(settings.funnelType);
        setAov(settings.aov != null ? String(settings.aov) : '');
        setHasHto(!!settings.hasHto);
        setHtoPrice(String(settings.htoPrice ?? ''));
        setHtoConversionRate(String(settings.htoConversionRate ?? ''));
        setRoasTarget(settings.roasTarget);
        setOfferPrice(settings.offerPrice != null ? String(settings.offerPrice) : '');
        setAttendanceRate(settings.attendanceRate != null ? String(settings.attendanceRate) : '');
        setBuyRateFromAttendees(settings.buyRateFromAttendees != null ? String(settings.buyRateFromAttendees) : '');
        setLeadToCloseRate(settings.leadToCloseRate != null ? String(settings.leadToCloseRate) : '');
    }, [settings]);

    const advisoryVisible = useMemo(() => {
        const a = settings?.advisories;
        const d = settings?.advisoriesDismissed;
        if (!a) return { noHto: false, lowValue: false };
        return {
            noHto: a.noHto && !(d?.noHto === true),
            lowValue: a.lowValue && !(d?.lowValue === true),
        };
    }, [settings]);

    if (!workspaceId || !accountId) {
        return (
            <div className={`p-6 rounded-lg border ${cardBg}`}>
                <p className={txMuted}>يرجى اختيار مساحة عمل وحساب ميتا أولاً.</p>
            </div>
        );
    }

    if (loading && !settings) {
        return (
            <div className={`p-6 rounded-lg border ${cardBg}`}>
                <p className={txMuted}>جاري التحميل…</p>
            </div>
        );
    }

    async function handleSave() {
        if (!workspaceId || !accountId) return;
        const req = {
            workspaceId,
            accountId,
            funnelType,
            aov: funnelType === 'paid_event' || funnelType === 'paid_product' ? Number(aov) || null : null,
            hasHto,
            htoPrice: Number(htoPrice) || 0,
            htoConversionRate: Number(htoConversionRate) || 0,
            roasTarget,
            offerPrice: funnelType === 'free_webinar' || funnelType === 'lead_magnet_call' ? Number(offerPrice) || null : null,
            attendanceRate: funnelType === 'free_webinar' ? Number(attendanceRate) || null : null,
            buyRateFromAttendees: funnelType === 'free_webinar' ? Number(buyRateFromAttendees) || null : null,
            leadToCloseRate: funnelType === 'lead_magnet_call' ? Number(leadToCloseRate) || null : null,
        };
        await save(req);
        if (settings && onSaved) onSaved(settings);
    }

    const paidDerived = settings?.derived.paid;
    const freeDerived = settings?.derived.free;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h2 className={`text-xl font-semibold ${txPrimary}`}>
                    إعدادات مسار المبيعات
                </h2>
                <p className={`text-sm ${txMuted}`}>
                    مساحة العمل: {workspaceName ?? workspaceId}
                </p>
            </div>

            {/* Advisory Cards (spec §2.6 — above results, non-blocking) */}
            {advisoryVisible.noHto && (
                <div className={`p-4 rounded-lg border-2 border-amber-500 ${dk ? 'bg-amber-950/40' : 'bg-amber-50'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className={`font-semibold ${txPrimary}`}>ملاحظة مهمة عن مسار المبيعات الخاص بك</h3>
                            <p className={`mt-1 text-sm ${txSecondary}`}>
                                لا يوجد لديك عرض ترويجي عالي القيمة (HTO) في إعداداتك. هذا يحد من قدرة المسار على استيعاب تكاليف الإعلانات الأعلى التي تحتاجها للوصول إلى عملاء يدفعون مبالغ كبيرة.
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label="إخفاء التنبيه"
                            className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
                            onClick={() => dismiss('noHto', true)}
                        >
                            إخفاء
                        </button>
                    </div>
                    <a
                        href={TEAM_DISCOVERY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                        احجز مكالمة
                    </a>
                </div>
            )}
            {advisoryVisible.lowValue && (
                <div className={`p-4 rounded-lg border-2 border-amber-500 ${dk ? 'bg-amber-950/40' : 'bg-amber-50'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className={`font-semibold ${txPrimary}`}>ملاحظة مهمة عن مسار المبيعات الخاص بك</h3>
                            <p className={`mt-1 text-sm ${txSecondary}`}>
                                قيمة العرض منخفضة جداً (أقل من 9 دولار). هذا يجعل من الصعب جداً تشغيل إعلانات مدفوعة بشكل مربح — تكلفة الاكتساب ستكون قريبة جداً من قيمة البيع.
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label="إخفاء التنبيه"
                            className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
                            onClick={() => dismiss('lowValue', true)}
                        >
                            إخفاء
                        </button>
                    </div>
                    <a
                        href={TEAM_DISCOVERY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                        احجز مكالمة
                    </a>
                </div>
            )}

            {/* Funnel-type dropdown */}
            <div>
                <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>نوع المسار</label>
                <select
                    className={`w-full p-2 rounded border ${dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    value={funnelType}
                    onChange={(e) => setFunnelType(e.target.value as FunnelType)}
                >
                    {(Object.keys(FUNNEL_LABELS) as FunnelType[]).map((ft) => (
                        <option key={ft} value={ft}>{FUNNEL_LABELS[ft].ar}</option>
                    ))}
                </select>
            </div>

            {/* Conditional fields per funnel-type */}
            {(funnelType === 'paid_event' || funnelType === 'paid_product') && (
                <div className="space-y-3">
                    <NumberField label="قيمة الطلب (دولار)" value={aov} onChange={setAov} isDarkMode={dk} />
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>هل لديك عرض ترويجي عالي القيمة؟</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setHasHto(true)} className={`px-3 py-2 rounded ${hasHto ? 'bg-indigo-600 text-white' : dk ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>نعم</button>
                            <button type="button" onClick={() => setHasHto(false)} className={`px-3 py-2 rounded ${!hasHto ? 'bg-indigo-600 text-white' : dk ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>لا</button>
                        </div>
                    </div>
                    {hasHto && (
                        <>
                            <NumberField label="سعر العرض الترويجي (دولار)" value={htoPrice} onChange={setHtoPrice} isDarkMode={dk} />
                            <NumberField label="نسبة تحويل العرض الترويجي (%)" value={htoConversionRate} onChange={setHtoConversionRate} isDarkMode={dk} />
                        </>
                    )}
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>هدف العائد على الإنفاق الإعلاني</label>
                        <div className="space-y-2">
                            {ROAS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setRoasTarget(opt.value)}
                                    className={`block w-full text-right p-3 rounded border ${roasTarget === opt.value ? 'border-indigo-500 bg-indigo-900/40' : dk ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-50'}`}
                                >
                                    <div className={`font-semibold ${txPrimary}`}>{opt.label}</div>
                                    <div className={`text-sm ${txMuted}`}>{opt.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {funnelType === 'free_webinar' && (
                <div className="space-y-3">
                    <NumberField label="سعر العرض النهائي (دولار)" value={offerPrice} onChange={setOfferPrice} isDarkMode={dk} />
                    <NumberField label="نسبة الحضور من المسجلين (%)" value={attendanceRate} onChange={setAttendanceRate} isDarkMode={dk} />
                    <NumberField label="نسبة الشراء من الحضور (%)" value={buyRateFromAttendees} onChange={setBuyRateFromAttendees} isDarkMode={dk} />
                </div>
            )}

            {funnelType === 'lead_magnet_call' && (
                <div className="space-y-3">
                    <NumberField label="سعر العرض النهائي (دولار)" value={offerPrice} onChange={setOfferPrice} isDarkMode={dk} />
                    <NumberField label="نسبة الإغلاق على المكالمة (%)" value={leadToCloseRate} onChange={setLeadToCloseRate} isDarkMode={dk} />
                </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="w-full px-4 py-3 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
                {loading ? 'جاري الحفظ…' : 'حفظ الإعدادات'}
            </button>

            {/* Results card */}
            {paidDerived && (
                <div className={`p-4 rounded-lg border ${cardBg}`}>
                    <h3 className={`font-semibold mb-2 ${txPrimary}`}>النتائج</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className={txMuted}>التكلفة المستهدفة الأولية:</span> <span className={txPrimary}>${paidDerived.rawTargetCpa.toFixed(2)}</span></div>
                        <div><span className={txMuted}>قيمة المشتري الكاملة:</span> <span className={txPrimary}>${paidDerived.fullBuyerValue.toFixed(2)}</span></div>
                        <div><span className={txMuted}>السقف الأقصى:</span> <span className={txPrimary}>${paidDerived.maxCpa.toFixed(2)}</span></div>
                        <div><span className={txMuted}>التكلفة المستهدفة النهائية:</span> <span className={txPrimary}>${paidDerived.effectiveTargetCpa.toFixed(2)}</span></div>
                    </div>
                    {paidDerived.capApplied && (
                        <div className={`mt-3 p-3 rounded border-2 border-yellow-500 ${dk ? 'bg-yellow-950/40' : 'bg-yellow-50'}`}>
                            <p className={`text-sm ${txPrimary}`}>
                                تم تطبيق السقف: التكلفة المستهدفة الأولية ${paidDerived.rawTargetCpa.toFixed(2)} تم تخفيضها إلى ${paidDerived.maxCpa.toFixed(2)}.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {freeDerived && (
                <div className={`p-4 rounded-lg border ${cardBg}`}>
                    <h3 className={`font-semibold mb-2 ${txPrimary}`}>النتائج</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className={txMuted}>قيمة العميل المحتمل:</span> <span className={txPrimary}>${freeDerived.leadValue.toFixed(2)}</span></div>
                        <div><span className={txMuted}>سقف التكلفة للعميل المحتمل:</span> <span className={txPrimary}>${freeDerived.economicCeilingCpl.toFixed(2)}</span></div>
                        <div><span className={txMuted}>التكلفة المستهدفة للعميل المحتمل:</span> <span className={txPrimary}>${freeDerived.effectiveTargetCpl.toFixed(2)}</span></div>
                    </div>
                </div>
            )}

            {/* Monthly-review prompt (dismissible, non-blocking) */}
            {reviewDue && (
                <div className={`p-3 rounded border ${cardBg} flex items-center justify-between`}>
                    <p className={`text-sm ${txSecondary}`}>مراجعة شهرية مستحقة — تأكد من تحديث القيم إذا تغيرت أسعار العرض.</p>
                </div>
            )}
        </div>
    );
}

// ─── Small helper component ─────────────────────────────────

function NumberField({ label, value, onChange, isDarkMode }: { label: string; value: string; onChange: (v: string) => void; isDarkMode: boolean }) {
    const inputCls = isDarkMode
        ? 'bg-slate-800 border-slate-700 text-white'
        : 'bg-white border-slate-300 text-slate-900';
    return (
        <div>
            <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
            <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full p-2 rounded border ${inputCls}`}
            />
        </div>
    );
}