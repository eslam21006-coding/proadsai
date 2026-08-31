// src/components/FunnelSettingsForm.tsx
// ═══════════════════════════════════════════════════════════
// Phase 14 — Layer 1 (US1) Funnel Settings form. The single source of
// truth for funnel economics per workspace-account.
//
// BEHAVIOR (spec §2.1–§2.6):
//   - Workspace-name header.
//   - Phase 14 batch 01-funnel-fixes — In-form workspace selector (only
//     when the user has >1 Meta-connected workspace). The dropdown is
//     rendered first so it visually anchors the rest of the form to the
//     chosen workspace-account; switching workspaces re-fetches the
//     settings for the new pair via the existing `useFunnelSettings`
//     hook (the hook is keyed on workspaceId + accountId).
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
// ARABIC COPY: all user-visible strings route through the i18n layer via
// `useT()` (per the coding guidelines — never hardcode UI text). The
// SC-11 lint guard scans string literals + JSX text for forbidden terms.
//
// DATA: `useFunnelSettings(workspaceId, accountId)` hook loads + saves.
// The hook reads from + writes to `saveFunnelSettings` / `getFunnelSettings`
// / `dismissAdvisory` callables (Phase 14 backend).
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useMemo, useRef } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { useT } from '../i18n';
import { resolveHtoConversionRateForSave } from '../utils/funnelSettingsSavePayload';

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
    // Phase 968 — Item D (Phase 7 carry-over): null for paid_event
    // when the field has never been set (the form removed the input).
    // For paid_product the value is always a number.
    htoConversionRate: number | null;
    roasTarget: RoasTarget;
    offerPrice: number | null;
    attendanceRate: number | null;
    buyRateFromAttendees: number | null;
    leadToCloseRate: number | null;
    // Phase 968 — T022. lead_magnet_call only.
    bookingRate: number | null;
    showUpRate: number | null;
    // Phase 968 — T045 (US3). paid_event only. The corrected formula
    // reads eventAttendanceRate × eventCloseRate on the HTO term
    // (FR-011..FR-014). Null on every other funnel type.
    eventAttendanceRate: number | null;
    eventCloseRate: number | null;
    // Phase 968 — T027. Shared fields, all four funnel types.
    commissionRate: number | null;
    marginKept: 50 | 60 | 70 | null;
    derived: DerivedTargets;
    advisories: Advisories;
    advisoriesDismissed: { noHto: boolean; lowValue: boolean };
    lastReviewedAt: number;
    reviewDueAt: number;
}

export interface FunnelSettingsFormProps {
    /** Initial workspace id (the currently-active workspace). Becomes the
     * form's pre-selected value in the workspace dropdown; the user can
     * switch to a different workspace from inside the form. */
    workspaceId: string | null;
    /** Initial Meta account id (paired with `workspaceId`). Re-derived
     * internally whenever the user picks a different workspace. */
    accountId: string | null;
    /** Display name for `workspaceId`. Used as the default label inside the
     * form header. */
    workspaceName?: string;
    isDarkMode?: boolean;
    /** Every active workspace on the account — including ones with no linked
     * Meta ad account, which render with a "needs Meta link" label (BUG B;
     * the caller used to pre-filter these out, which made the list look
     * truncated). Used to populate the in-form workspace selector (Issue 4).
     * When the list has more than one entry, the selector renders as a
     * dropdown. When the list has exactly one entry, the selector is omitted
     * and the workspace name is shown as static text — there's no UI noise
     * for single-workspace users. When the list is empty the form returns the
     * "no workspace" guard from before. */
    availableWorkspaces?: Array<{ id: string; name: string; metaAdAccountId?: string | null; metaAdAccountName?: string | null }>;
    /** True when the signed-in user is a team member rather than the account
     * owner. Only affects copy: a member cannot link a Meta ad account
     * themselves (`linkMetaAccountToWorkspace` refuses them server-side), so
     * the unlinked-workspace guard tells them to ask the owner instead of
     * pointing at a menu entry they don't have. */
    isTeamMember?: boolean;
    /** Called after a successful save — parent may close the form or refresh data. */
    onSaved?: (settings: FunnelSettingsDoc) => void;
}

const TEAM_DISCOVERY_URL = 'https://eslamsalah.com/team-discovery-call';

// ─── numOrNull helper ─────────────────────────────────────────
//
// `Number(x) || null` is wrong because `0` is falsy and would be coerced
// to `null`. The backend's `asNumberOrNull` (functions/src/funnelSettings.ts)
// uses `Number.isFinite(n)` to preserve a real `0`. This frontend helper
// mirrors that — preserves a 0 input as the number 0, returns null for
// empty/missing/NaN.
function numOrNull(v: string): number | null {
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// ─── Completeness predicate (Phase 10 T058) ──────────────────
//
// Extracted from the `missingFields` useMemo so the parity test can
// pin agreement with the backend's `missingRequiredFields`
// (`functions/src/funnelSettings.ts` — single canonical definition
// per FR-050). Both sides encode `data-model.md §3`:
//
//   - `null` / missing → incomplete
//   - `0` → COMPLETE (a zero commission or zero rate is legitimate)
//   - hasHto === false drops the HTO fields from the required set
//   - stored-but-unread fields are not part of the rule (Item A:
//     paid_event does not require `htoConversionRate` even when
//     hasHto=true)
//
// Two implementations exist today (this function on the frontend,
// `missingRequiredFields` on the backend). Constitution XI forbids
// drift; the parity test at
// `functions/src/__tests__/funnelEconomicsParity.test.ts` asserts
// the two produce the same missing-field list for every (funnelType,
// hasHto, missing-field) permutation. The cleanest end-state would
// be a single shared module — that's a separate refactor outside
// T058's scope; this function is named and exported so the parity
// test can import it from the frontend vitest suite today.
//
// Returns a sorted, deduplicated array so callers can compare with
// deep-equal without ordering surprises.
export interface ComputeMissingFieldsInput {
    funnelType: FunnelType;
    hasHto: boolean;
    aov: string;
    roasTarget: number | null;
    htoPrice: string;
    htoConversionRate: string;
    eventAttendanceRate: string;
    eventCloseRate: string;
    offerPrice: string;
    attendanceRate: string;
    buyRateFromAttendees: string;
    leadToCloseRate: string;
    bookingRate: string;
    showUpRate: string;
    commissionRate: string;
    marginKept: 50 | 60 | 70 | null;
}

export function computeMissingFields(input: ComputeMissingFieldsInput): ReadonlyArray<string> {
    const isEmptyString = (v: string | null | undefined) => v === undefined || v === null || v === '';
    // ROAS is a closed enum (1.0/0.65/0.5) — `roasTarget` is a
    // number, not a string. `null`/`undefined` is incomplete.
    const isEmptyNumber = (v: number | null | undefined) => v === undefined || v === null;
    const missing = new Set<string>();
    if (input.funnelType === 'paid_event' || input.funnelType === 'paid_product') {
        if (isEmptyString(input.aov)) missing.add('aov');
        // Phase 968 — T041 mirror (FR-016). roasTarget is OPTIONAL
        // on paid_event — the form defaults to 0.5 and the backend
        // fills it if absent. paid_product still requires an explicit
        // choice.
        if (input.funnelType === 'paid_product' && isEmptyNumber(input.roasTarget)) missing.add('roasTarget');
        if (input.hasHto) {
            if (isEmptyString(input.htoPrice)) missing.add('htoPrice');
            if (input.funnelType === 'paid_product' && isEmptyString(input.htoConversionRate)) missing.add('htoConversionRate');
        }
    }
    // Phase 968 — T045 (US3). paid_event event rates — the frontend
    // mirror of the backend's completeness rule (FR-011..FR-014):
    // paid_event reads these on the HTO term, both required;
    // htoConversionRate is NOT required on paid_event (Item A
    // asymmetry).
    if (input.funnelType === 'paid_event') {
        if (isEmptyString(input.eventAttendanceRate)) missing.add('eventAttendanceRate');
        if (isEmptyString(input.eventCloseRate)) missing.add('eventCloseRate');
    }
    if (input.funnelType === 'free_webinar') {
        if (isEmptyString(input.offerPrice)) missing.add('offerPrice');
        if (isEmptyString(input.attendanceRate)) missing.add('attendanceRate');
        if (isEmptyString(input.buyRateFromAttendees)) missing.add('buyRateFromAttendees');
    }
    if (input.funnelType === 'lead_magnet_call') {
        if (isEmptyString(input.offerPrice)) missing.add('offerPrice');
        if (isEmptyString(input.leadToCloseRate)) missing.add('leadToCloseRate');
        if (isEmptyString(input.bookingRate)) missing.add('bookingRate');
        if (isEmptyString(input.showUpRate)) missing.add('showUpRate');
    }
    if (isEmptyString(input.commissionRate)) missing.add('commissionRate');
    if (isEmptyNumber(input.marginKept)) missing.add('marginKept');
    // Set semantics with declaration-order iteration: the order
    // matches the backend's `missingRequiredFields` (which iterates
    // `requiredFieldsForDoc` in declaration order). The two outputs
    // agree byte-for-byte on the same input — T058's parity test
    // compares them directly without sorting. Pre-extraction the
    // useMemo pushed fields in declaration order; preserving that
    // order here keeps the form's rendered text identical for
    // owners (no visible reorder).
    return [...missing];
}

// ─── Hook: load + save + dismiss ─────────────────────────────

interface UseFunnelSettingsReturn {
    loading: boolean;
    error: string | null;
    // CR-MAJOR (CodeRabbit review feedback): when the callable
    // refuses with `permission-denied / accountId does not match`, the
    // modal should treat that as an unlinked-workspace state, not a
    // generic load failure. Carries a structured flag for the guard.
    unlinked: boolean;
    settings: FunnelSettingsDoc | null;
    reviewDue: boolean;
    save: (req: Omit<SaveFunnelSettingsRequest, 'clientNowMs'> & { clientNowMs?: number }) => Promise<FunnelSettingsDoc>;
    dismiss: (key: 'noHto' | 'lowValue', dismissed: boolean) => Promise<void>;
}

interface SaveFunnelSettingsRequest {
    workspaceId: string;
    accountId: string;
    funnelType: FunnelType;
    aov?: number | null;
    hasHto?: boolean;
    htoPrice?: number;
    // Phase 968 — Item D (Phase 7 carry-over): paid_event sends null
    // so the doc retains its stored value verbatim (no overwrite
    // with 0). The backend treats null on paid_event as "do not
    // touch the stored value" and on paid_product as "no value".
    htoConversionRate?: number | null;
    roasTarget?: RoasTarget;
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    // Phase 968 — T022. Sent only for lead_magnet_call; backend
    // validator (assertRequiredFieldPresent) accepts null on every
    // other funnel type.
    bookingRate?: number | null;
    showUpRate?: number | null;
    // Phase 968 — T045 (US3). paid_event only; backend validator
    // accepts null on every other funnel type.
    eventAttendanceRate?: number | null;
    eventCloseRate?: number | null;
    // Phase 968 — T027. Shared fields, all four funnel types.
    commissionRate?: number | null;
    marginKept?: 50 | 60 | 70 | null;
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
    const [unlinked, setUnlinked] = useState(false);
    const [settings, setSettings] = useState<FunnelSettingsDoc | null>(null);
    const [reviewDue, setReviewDue] = useState(false);

    // CR-MAJOR (CodeRabbit round 7): apply the adjust-state-during-render
    // pattern (see lines 349-353 / 379-383 below) to the missing-input
    // reset. The previous effect called `setSettings(null)` /
    // `setReviewDue(false)` / `setUnlinked(false)` synchronously from its
    // body, which trips `react-hooks/set-state-in-effect` and forces a
    // cascading render. Detect the transition in render and set state
    // there instead — the effect stays responsible only for the fetch.
    const inputsMissing = !workspaceId || !accountId;
    const [prevInputsMissing, setPrevInputsMissing] = useState(inputsMissing);
    if (inputsMissing !== prevInputsMissing) {
        setPrevInputsMissing(inputsMissing);
        if (inputsMissing) {
            setSettings(null);
            setReviewDue(false);
            setUnlinked(false);
        }
    }

    useEffect(() => {
        if (!workspaceId || !accountId) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        setUnlinked(false);
        const fn = httpsCallable(functions, 'getFunnelSettings');
        fn({ workspaceId, accountId })
            .then((res) => {
                if (cancelled) return;
                const data = res.data as { ok: true; settings: FunnelSettingsDoc | null; reviewDue: boolean };
                setSettings(data.settings);
                setReviewDue(!!data.reviewDue);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                // CR-MAJOR (CodeRabbit review feedback): the round-4 fix
                // on funnelSettings.ts:getFunnelSettings rejects an
                // unlinked-workspace pair with `permission-denied`. Treat
                // that specific verdict as the "needs Meta link" state
                // instead of a generic load failure so the user gets the
                // actionable message rendered by the existing guard.
                const code = (e as { code?: string })?.code;
                if (code === 'functions/permission-denied' || code === 'permission-denied') {
                    setUnlinked(true);
                    setSettings(null);
                    setError(null);
                    return;
                }
                setError(typeof (e as { message?: unknown })?.message === 'string'
                    ? (e as { message: string }).message
                    : 'Failed to load funnel settings.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId, accountId]);

    const save = async (req: Omit<SaveFunnelSettingsRequest, 'clientNowMs'> & { clientNowMs?: number }): Promise<FunnelSettingsDoc> => {
        setLoading(true);
        setError(null);
        const clientNowMs = req.clientNowMs ?? Date.now();
        try {
            const fn = httpsCallable(functions, 'saveFunnelSettings');
            const res = await fn({ ...req, clientNowMs });
            const data = res.data as SaveFunnelSettingsResponse;
            // Optimistic merge — server is authoritative but we don't get the
            // full doc back. Construct a minimal doc so the form can re-render.
            const next: FunnelSettingsDoc = {
                accountId: req.accountId,
                funnelType: req.funnelType,
                aov: req.aov ?? null,
                hasHto: req.hasHto === true,
                htoPrice: req.hasHto ? (req.htoPrice ?? 0) : 0,
                // Phase 968 — Item D (Phase 7 carry-over, Phase 9 close-out):
                // on paid_event the form removed the htoConversionRate
                // input (Phase 7 Item C) and the saved value is preserved
                // verbatim — including a stored `null`. The save request
                // carries the form's pass-through value (req.htoConversionRate,
                // which for paid_event equals `settings?.htoConversionRate
                // ?? null`); the optimistic merge mirrors it. paid_product
                // continues to read the form's input.
                htoConversionRate: req.funnelType === 'paid_event'
                    ? (req.htoConversionRate ?? null)
                    : req.hasHto ? (req.htoConversionRate ?? 0) : 0,
                roasTarget: req.roasTarget ?? 1.0,
                offerPrice: req.offerPrice ?? null,
                attendanceRate: req.attendanceRate ?? null,
                buyRateFromAttendees: req.buyRateFromAttendees ?? null,
                leadToCloseRate: req.leadToCloseRate ?? null,
                // Phase 968 — T022. Mirror backend: null on every funnel
                // type except lead_magnet_call.
                bookingRate: req.funnelType === 'lead_magnet_call' ? (req.bookingRate ?? null) : null,
                showUpRate: req.funnelType === 'lead_magnet_call' ? (req.showUpRate ?? null) : null,
                // Phase 968 — T045 (US3). Mirror backend: null on every
                // funnel type except paid_event.
                eventAttendanceRate: req.funnelType === 'paid_event' ? (req.eventAttendanceRate ?? null) : null,
                eventCloseRate: req.funnelType === 'paid_event' ? (req.eventCloseRate ?? null) : null,
                // Phase 968 — T027. Shared fields.
                commissionRate: req.commissionRate ?? null,
                marginKept: req.marginKept ?? null,
                derived: data.derived,
                advisories: data.advisories,
                advisoriesDismissed: settings?.advisoriesDismissed ?? { noHto: false, lowValue: false },
                lastReviewedAt: clientNowMs,
                reviewDueAt: data.reviewDueAt,
            };
            setSettings(next);
            setReviewDue(false); // a fresh review just happened
            return next;  // CodeRabbit audit: callers (onSaved) need the persisted doc, not a stale closure.
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

    return { loading, error, unlinked, settings, reviewDue, save, dismiss };
}

// ─── Form component ──────────────────────────────────────────

const FUNNEL_LABELS: Record<FunnelType, { ar: string; en: string }> = {
    paid_event: { ar: 'فعالية مدفوعة', en: 'Paid Event' },
    paid_product: { ar: 'منتج مدفوع', en: 'Paid Product' },
    free_webinar: { ar: 'ويبينار مجاني', en: 'Free Webinar' },
    lead_magnet_call: { ar: 'مغناطيس عملاء محتمل + مكالمة', en: 'Lead Magnet → Call' },
};

const ROAS_OPTIONS: Array<{ value: RoasTarget; label: string; sub: string }> = [
    { value: 1.0, label: '1.0 — توازن', sub: 'استرداد التكلفة فقط' },
    { value: 0.65, label: '0.65 — استثمار معتدل', sub: 'تقبل خسارة بسيطة مقابل بيانات' },
    { value: 0.5, label: '0.5 — استثمار أعلى', sub: 'تقبل خسارة أكبر مقابل بيانات أكثر' },
];

// Phase 968 — T029. marginKept three-button preset. Bare numbers per
// contracts/uiCopy.md #20 (50 · 60 · 70). The sub-label is the trade-off
// explanation — "More room to spend" / "Balanced" / "More profit kept" —
// and is the same in both languages because it's a single phrase
// describing a trade-off axis, not user-facing copy. Labels follow the
// ROAS_OPTIONS pattern above. FR-024, FR-025, FR-025a.
const MARGIN_OPTIONS: Array<{
    value: 50 | 60 | 70;
    labelAr: string;
    subAr: string;
    subEn: string;
}> = [
    {
        value: 50,
        labelAr: '٥٠ — مساحة أكبر للإنفاق',
        subAr: 'تنفق أكثر مقابل ربح أقل',
        subEn: 'Spend more, keep less',
    },
    {
        value: 60,
        labelAr: '٦٠ — متوازن',
        subAr: 'توازن بين الإنفاق والربح',
        subEn: 'Balanced',
    },
    {
        value: 70,
        labelAr: '٧٠ — ربح أكبر محتفظ به',
        subAr: 'تنفق أقل مقابل ربح أكبر',
        subEn: 'Keep more, spend less',
    },
];

export default function FunnelSettingsForm({
    workspaceId,
    accountId,
    workspaceName,
    isDarkMode = true,
    availableWorkspaces,
    isTeamMember = false,
    onSaved,
}: FunnelSettingsFormProps) {
    const dk = isDarkMode;
    const txPrimary = dk ? 'text-white' : 'text-slate-900';
    const txSecondary = dk ? 'text-slate-300' : 'text-slate-700';
    const txMuted = dk ? 'text-slate-400' : 'text-slate-500';
    const cardBg = dk ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
    const selectBg = dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900';

    const { lang } = useT();
    // Local bilingual helper mirroring PerformanceDashboard.tsx — runs
    // through `lang` from the i18n provider so this component participates
    // in the same RTL/Fusha policy as the rest of the UI. Avoids inflating
    // the 1665-line central dictionary for a single component.
    const L = (en: string, ar: string) => lang === 'ar' ? ar : en;

    // ─── Workspace selector (Issue 4) ─────────────────────────
    // The parent passes the initial workspace/account via props (the
    // currently-active workspace). Internally we own the "currently
    // displayed workspace" state so the user can switch from inside the
    // form. When the user picks a different workspace:
    //   1. We update `selectedWorkspaceId` and re-derive
    //      `selectedAccountId` from the workspace's linked Meta account.
    //   2. The `useFunnelSettings` hook (keyed on those values) re-fetches
    //      `settings/current` for the new workspace-account.
    //   3. The `hydratedForRef` guard in the existing hydration effect
    //      (below) resets so the new account's settings populate the
    //      form fields.
    //
    // The dropdown is only rendered when there's >1 Meta-connected
    // workspace — single-workspace users see the workspace name as a
    // static line in the header instead (no UI noise).
    const initialWsId = workspaceId ?? '';
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(initialWsId);
    // Re-derive selectedAccountId from the currently selected workspace.
    // We default to the parent-supplied `accountId` when the selected
    // workspace matches the initial one (so the very first render is
    // synchronous), and look up the new account id from
    // `availableWorkspaces` when the user picks a different workspace.
    const selectedWorkspace = availableWorkspaces?.find(w => w.id === selectedWorkspaceId);
    const selectedAccountId = selectedWorkspaceId === initialWsId
        ? (accountId ?? selectedWorkspace?.metaAdAccountId ?? null)
        : (selectedWorkspace?.metaAdAccountId ?? null);

    // When the parent's `workspaceId` prop changes (active workspace
    // switched in the workspace switcher above the form), reset the
    // in-form selection to track it. Done in render (the
    // "adjusting state when a prop changes" pattern) instead of an effect.
    const [prevParentWsId, setPrevParentWsId] = useState(initialWsId);
    if (initialWsId !== prevParentWsId) {
        setPrevParentWsId(initialWsId);
        setSelectedWorkspaceId(initialWsId);
    }

    const showWorkspaceSelector = !!availableWorkspaces && availableWorkspaces.length > 1;

    const { loading, error, unlinked, settings, reviewDue, save, dismiss } = useFunnelSettings(selectedWorkspaceId || null, selectedAccountId);

    // Form state
    const [funnelType, setFunnelType] = useState<FunnelType>('paid_event');
    const [aov, setAov] = useState<string>('');
    const [hasHto, setHasHto] = useState<boolean>(false);
    const [htoPrice, setHtoPrice] = useState<string>('');
    const [htoConversionRate, setHtoConversionRate] = useState<string>('');
    // Phase 968 — T041 (FR-016): paid_event defaults roasTarget to 0.5
    // (controlled front-end loss). All other paid types default to 1.0
    // (break-even). The user's choice is persisted on save.
    const [roasTarget, setRoasTarget] = useState<RoasTarget>(0.5);
    const [offerPrice, setOfferPrice] = useState<string>('');
    const [attendanceRate, setAttendanceRate] = useState<string>('');
    const [buyRateFromAttendees, setBuyRateFromAttendees] = useState<string>('');
    const [leadToCloseRate, setLeadToCloseRate] = useState<string>('');
    // Phase 968 — T022. lead_magnet_call only.
    const [bookingRate, setBookingRate] = useState<string>('');
    const [showUpRate, setShowUpRate] = useState<string>('');
    // Phase 968 — T045 (US3): paid_event event rates. The corrected
    // formula reads eventAttendanceRate × eventCloseRate on the HTO
    // term (FR-011..FR-014). These replace the (legacy, unread)
    // htoConversionRate for paid_event. Defaults: 75 / 7.5 per the
    // §6.3 worked example.
    const [eventAttendanceRate, setEventAttendanceRate] = useState<string>('75');
    const [eventCloseRate, setEventCloseRate] = useState<string>('7.5');
    // Phase 968 — T027. Shared fields, all four funnel types.
    // Default to the spec-defined new-record values (DEFAULT_COMMISSION_RATE=10,
    // DEFAULT_MARGIN_KEPT=60) so a brand-new form starts in a valid state
    // without requiring the owner to touch them first.
    const [commissionRate, setCommissionRate] = useState<string>('10');
    const [marginKept, setMarginKept] = useState<50 | 60 | 70>(60);

    // Phase 968 — T038 (FR-052): compute the missing-fields set against
    // the canonical completeness rule (single source of truth in
    // functions/src/funnelSettings.ts; T058 parity test locks the two
    // in lockstep). Used to render the paused-targets notice + per-
    // field `Required` markers so the owner sees which inputs block
    // the save and the target.
    //
    // Mirrors the backend rule (data-model.md §3) — `null`/missing is
    // incomplete, `0` is complete, hasHto=false drops the HTO fields
    // from the required set, and htoConversionRate is NOT required on
    // paid_event (Item A decision in batch-05-report.md).
    //
    // Phase 10 T058: the body is extracted into a named exported
    // function so the parity test can pin agreement with the backend
    // (`functions/src/__tests__/funnelEconomicsParity.test.ts`) and
    // future regressions surface as a test failure rather than as
    // drift between two implementations.
    const missingFields = useMemo<ReadonlyArray<string>>(() => computeMissingFields({
        funnelType,
        hasHto,
        aov,
        roasTarget,
        htoPrice,
        htoConversionRate,
        eventAttendanceRate,
        eventCloseRate,
        offerPrice,
        attendanceRate,
        buyRateFromAttendees,
        leadToCloseRate,
        bookingRate,
        showUpRate,
        commissionRate,
        marginKept,
    }), [funnelType, hasHto, aov, roasTarget, htoPrice, htoConversionRate, eventAttendanceRate, eventCloseRate, offerPrice, attendanceRate, buyRateFromAttendees, leadToCloseRate, bookingRate, showUpRate, commissionRate, marginKept]);

    // Local dismiss state for the monthly-review prompt. Resets when
    // `reviewDue` flips back to true on a fresh save (the save function
    // calls setReviewDue(false), so the card hides itself naturally on
    // the next hydration cycle too).
    const [reviewDismissed, setReviewDismissed] = useState<boolean>(false);
    // Adjust state during render (React's "adjusting state when a prop
    // changes" pattern) instead of an effect — avoids the
    // `setState-in-effect` lint error and the extra synchronous render.
    const [prevReviewDue, setPrevReviewDue] = useState(reviewDue);
    if (reviewDue !== prevReviewDue) {
        setPrevReviewDue(reviewDue);
        if (reviewDue) setReviewDismissed(false);
    }

    // Track the last-hydrated accountId so the hydration effect only runs
    // once per account (avoids the setState-in-effect cascading-render issue
    // when `settings` is re-fetched after a save — CodeRabbit audit).
    const hydratedForRef = useRef<string | null>(null);
    useEffect(() => {
        if (!settings) return;
        if (hydratedForRef.current === settings.accountId) return;
        hydratedForRef.current = settings.accountId;
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
        // Phase 968 — T022. lead_magnet_call only. Pre-phase docs have
        // `null` here; the form starts blank and Phase 5's completeness
        // gate will mark these as required.
        setBookingRate(settings.bookingRate != null ? String(settings.bookingRate) : '');
        setShowUpRate(settings.showUpRate != null ? String(settings.showUpRate) : '');
        // Phase 968 — T045 (US3). paid_event event rates. Pre-phase docs
        // have null here; fall back to the §6.3 worked-example defaults.
        setEventAttendanceRate(settings.eventAttendanceRate != null ? String(settings.eventAttendanceRate) : '75');
        setEventCloseRate(settings.eventCloseRate != null ? String(settings.eventCloseRate) : '7.5');
        // Phase 968 — T027. Shared fields. Pre-phase docs have `null`;
        // fall back to the new-record defaults so the form renders in
        // a valid initial state.
        setCommissionRate(settings.commissionRate != null ? String(settings.commissionRate) : '10');
        setMarginKept(settings.marginKept != null ? settings.marginKept : 60);
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

    // BUG B — the "pick a workspace and a Meta account" guard used to sit
    // here and `return` outright, ABOVE the workspace selector. The moment a
    // workspace without a linked ad account was selected, the whole form —
    // including the dropdown the user had just used — was replaced by a single
    // line of text, with no control left to switch back; only closing and
    // reopening the modal recovered. Now it is a flag, and the guard body is
    // rendered BELOW the selector further down, so the selector always stays
    // on screen and the state is navigable.
    //
    // CR-MAJOR (CodeRabbit review feedback): also include the callable's
    // `permission-denied` verdict (which the round-4 server fix returns
    // when the workspace-account link disappears between renders). Without
    // this OR the stale render shows the raw server error.
    const needsMetaLink = !selectedWorkspaceId || !selectedAccountId || unlinked;

    async function handleSave() {
        if (!selectedWorkspaceId || !selectedAccountId) return;
        const aovN = funnelType === 'paid_event' || funnelType === 'paid_product' ? numOrNull(aov) : null;
        const offerN = funnelType === 'free_webinar' || funnelType === 'lead_magnet_call' ? numOrNull(offerPrice) : null;
        const attendanceN = funnelType === 'free_webinar' ? numOrNull(attendanceRate) : null;
        const buyN = funnelType === 'free_webinar' ? numOrNull(buyRateFromAttendees) : null;
        const leadN = funnelType === 'lead_magnet_call' ? numOrNull(leadToCloseRate) : null;
        // Phase 968 — T022. Sent only for lead_magnet_call.
        const bookingN = funnelType === 'lead_magnet_call' ? numOrNull(bookingRate) : null;
        const showUpN = funnelType === 'lead_magnet_call' ? numOrNull(showUpRate) : null;
        // Phase 968 — T045 (US3). paid_event event rates. The backend
        // ignores them on every other funnel type (FR-011..FR-014
        // scope paid_event only).
        const eventAttendanceN = funnelType === 'paid_event' ? numOrNull(eventAttendanceRate) : null;
        const eventCloseN = funnelType === 'paid_event' ? numOrNull(eventCloseRate) : null;
        // Phase 968 — T027. commissionRate + marginKept apply to all four
        // funnel types per FR-023/FR-024/OQ-1 override.
        const commissionN = numOrNull(commissionRate);
        const req = {
            workspaceId: selectedWorkspaceId,
            accountId: selectedAccountId,
            funnelType,
            aov: aovN,
            hasHto,
            htoPrice: numOrNull(htoPrice) ?? 0,
            // Phase 968 — Item D (Phase 7 carry-over, Phase 9 close-out):
            // paid_event does NOT read `htoConversionRate` (FR-011..FR-014).
            // The form removed the input (Phase 7 Item C). Storage
            // retention (data-model.md §1) means the field is preserved
            // verbatim — including a stored `null`. The previous
            // implementation sent `0` when the stored value was `null`,
            // which would overwrite a pre-existing `null` with `0` and
            // break the revert-stays-code-only property the deferred
            // epoch phase relies on.
            //
            // Phase 10 Item D: the resolution logic is extracted into
            // `src/utils/funnelSettingsSavePayload.ts` so the chain is
            // unit-testable end-to-end at the form layer (mirrors the
            // backend's `resolveHtoConversionRateForStorage` helper).
            htoConversionRate: resolveHtoConversionRateForSave(
                funnelType,
                htoConversionRate,
                settings?.htoConversionRate,
            ),
            roasTarget,
            offerPrice: offerN,
            attendanceRate: attendanceN,
            buyRateFromAttendees: buyN,
            leadToCloseRate: leadN,
            bookingRate: bookingN,
            showUpRate: showUpN,
            eventAttendanceRate: eventAttendanceN,
            eventCloseRate: eventCloseN,
            commissionRate: commissionN,
            marginKept,
        };
        // Save returns the persisted doc (avoiding the stale-settings
        // closure trap where `onSaved` would receive the pre-save snapshot,
        // or be skipped entirely on the very first save — CodeRabbit audit).
        const saved = await save(req);
        if (saved) onSaved?.(saved);
    }

    const paidDerived = settings?.derived.paid;
    const freeDerived = settings?.derived.free;
    // Resolve the workspace/account names for the header. The workspace
    // name comes from `availableWorkspaces` when the user picked one; if
    // the parent's `workspaceName` is supplied (single-workspace case),
    // fall back to that.
    const headerWorkspaceName = selectedWorkspace?.name ?? workspaceName ?? workspaceId ?? '';

    // BUG B — header and selector are extracted so every render state (needs
    // link / loading / full form) shows the SAME two blocks at the top. That
    // is what keeps the workspace dropdown reachable from the guard state.
    const headerBlock = (
        <div>
            <h2 className={`text-xl font-semibold ${txPrimary}`}>
                {L('Funnel Settings', 'إعدادات مسار المبيعات')}
            </h2>
            <p className={`text-sm ${txMuted}`}>
                {L('Workspace:', 'مساحة العمل:')} {headerWorkspaceName}
            </p>
        </div>
    );

    // Workspace selector (Issue 4) — rendered whenever the account has more
    // than one workspace. Single-workspace users see the workspace name as
    // static text in the header above and skip this block entirely. The
    // selector is rendered first so it visually anchors the rest of the form
    // to the chosen workspace-account.
    // BUG B — the list now includes workspaces with no linked Meta ad
    // account, so each option states its link status inline.
    const workspaceSelectorBlock = showWorkspaceSelector && availableWorkspaces ? (
        <div>
            <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>
                {L('Select Workspace', 'اختر مساحة العمل')}
            </label>
            <select
                aria-label={L('Select Workspace', 'اختر مساحة العمل')}
                className={`w-full p-2 rounded border ${selectBg}`}
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            >
                {availableWorkspaces.map(ws => (
                    <option key={ws.id} value={ws.id}>
                        {ws.name}{ws.metaAdAccountName ? ` — ${ws.metaAdAccountName}` : ' — ' + L('needs Meta link', 'يحتاج ربط ميتا')}
                    </option>
                ))}
            </select>
            {/* Show the linked Meta account name as a muted sub-line
                below the dropdown so the user always sees which ad
                account this workspace's settings will save against. */}
            {selectedWorkspace?.metaAdAccountName && (
                <p className={`mt-1 text-[10px] ${txMuted}`}>
                    {L('Linked Meta account:', 'حساب ميتا المربوط:')} {selectedWorkspace.metaAdAccountName}
                </p>
            )}
        </div>
    ) : null;

    // BUG B — the former early-return guard, now rendered BELOW the selector.
    // The message names the actual blocker (this workspace has no Meta ad
    // account) and gives the two ways forward, instead of the old generic
    // "pick a workspace and a Meta account first".
    if (needsMetaLink) {
        return (
            <div className="space-y-4">
                {headerBlock}
                {workspaceSelectorBlock}
                <div className={`p-6 rounded-lg border ${cardBg}`}>
                    <p className={txPrimary}>
                        {L(
                            'This workspace has no Meta ad account linked yet.',
                            'لا يوجد حساب إعلانات ميتا مربوط بهذه المساحة.',
                        )}
                    </p>
                    {/* A team member cannot link the account themselves —
                        `linkMetaAccountToWorkspace` refuses them server-side and
                        the "Change Account" / "Select ad account" menu entries
                        are hidden for them — so pointing at the Meta menu would
                        send them somewhere that does not exist. Name the person
                        who CAN do it instead. */}
                    <p className={`mt-2 text-sm ${txMuted}`}>
                        {isTeamMember
                            ? L(
                                'Funnel settings are saved per ad account. Ask the account owner to link a Meta ad account to this workspace — or pick another workspace above.',
                                'تُحفظ إعدادات المسار لكل حساب إعلانات. اطلب من صاحب الحساب ربط حساب ميتا بهذه المساحة، أو اختر مساحة أخرى من الأعلى.',
                            )
                            : L(
                                'Funnel settings are saved per ad account, so link one from the Meta menu first — or pick another workspace above.',
                                'تُحفظ إعدادات المسار لكل حساب إعلانات، لذلك اربط حسابا من قائمة ميتا أولا، أو اختر مساحة أخرى من الأعلى.',
                            )}
                    </p>
                </div>
            </div>
        );
    }

    if (loading && !settings) {
        return (
            <div className="space-y-4">
                {headerBlock}
                {workspaceSelectorBlock}
                <div className={`p-6 rounded-lg border ${cardBg}`}>
                    <p className={txMuted}>{L('Loading…', 'جاري التحميل…')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {headerBlock}
            {workspaceSelectorBlock}

            {/* Advisory Cards (spec §2.6 — above results, non-blocking) */}
            {advisoryVisible.noHto && (
                <div className={`p-4 rounded-lg border-2 border-amber-500 ${dk ? 'bg-amber-950/40' : 'bg-amber-50'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className={`font-semibold ${txPrimary}`}>{L('Important note about your funnel', 'ملاحظة مهمة عن مسار المبيعات الخاص بك')}</h3>
                            <p className={`mt-1 text-sm ${txSecondary}`}>
                                {/* Phase 10 — Item B (Phase 9 rule breach): the
                                    previous body shipped `(HTO)` as a
                                    parenthetical English acronym inside
                                    user-facing Arabic. The acronym is a
                                    technical term and belongs in internal
                                    code + comments only (FR-019 spirit —
                                    user-facing Arabic is plain Fusha with
                                    no English-transliterated technical
                                    terms). Strip the acronym and align the
                                    wording to `uiCopy.md` #15's
                                    "high-ticket offer" / "عرض عالي القيمة"
                                    rename so the question and the body use
                                    the same Fusha noun. See
                                    `contracts/uiCopy.md` #15a for the
                                    canonical pair. */}
                                {L('You don\u2019t have a high-ticket offer configured. This limits the funnel\u2019s ability to absorb the higher ad spend needed to reach customers who pay large amounts.', 'لا يوجد لديك عرض عالي القيمة في إعداداتك. هذا يحد من قدرة المسار على استيعاب تكاليف الإعلانات الأعلى التي تحتاجها للوصول إلى عملاء يدفعون مبالغ كبيرة.')}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label={L('Hide notification', 'إخفاء التنبيه')}
                            className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
                            onClick={() => dismiss('noHto', true)}
                        >
                            {L('Hide', 'إخفاء')}
                        </button>
                    </div>
                    <a
                        href={TEAM_DISCOVERY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                        {L('Book a call', 'احجز مكالمة')}
                    </a>
                </div>
            )}
            {advisoryVisible.lowValue && (
                <div className={`p-4 rounded-lg border-2 border-amber-500 ${dk ? 'bg-amber-950/40' : 'bg-amber-50'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className={`font-semibold ${txPrimary}`}>{L('Important note about your funnel', 'ملاحظة مهمة عن مسار المبيعات الخاص بك')}</h3>
                            <p className={`mt-1 text-sm ${txSecondary}`}>
                                {L('Your offer value is very low (under $9). This makes it very hard to run paid ads profitably — the acquisition cost will be very close to the sale value.', 'قيمة العرض منخفضة جداً (أقل من 9 دولار). هذا يجعل من الصعب جداً تشغيل إعلانات مدفوعة بشكل مربح — تكلفة الاكتساب ستكون قريبة جداً من قيمة البيع.')}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label={L('Hide notification', 'إخفاء التنبيه')}
                            className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
                            onClick={() => dismiss('lowValue', true)}
                        >
                            {L('Hide', 'إخفاء')}
                        </button>
                    </div>
                    <a
                        href={TEAM_DISCOVERY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                        {L('Book a call', 'احجز مكالمة')}
                    </a>
                </div>
            )}

            {/* Funnel-type dropdown */}
            <div>
                <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>{L('Funnel type', 'نوع المسار')}</label>
                <select
                    className={`w-full p-2 rounded border ${dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    value={funnelType}
                    onChange={(e) => {
                        const newType = e.target.value as FunnelType;
                        setFunnelType(newType);
                        // Phase 968 — T041 (FR-016): paid_event preselects
                        // 0.5 (controlled front-end loss); all other paid
                        // types preselect 1.0 (break-even). The user can
                        // override; the persistance round-trip stores
                        // whatever they choose.
                        setRoasTarget(newType === 'paid_event' ? 0.5 : 1.0);
                    }}
                >
                    {(Object.keys(FUNNEL_LABELS) as FunnelType[]).map((ft) => (
                        <option key={ft} value={ft}>{lang === 'ar' ? FUNNEL_LABELS[ft].ar : FUNNEL_LABELS[ft].en}</option>
                    ))}
                </select>
            </div>

            {/* Phase 968 — T038 (FR-052). Paused-targets notice.
                Shown when at least one required field is missing — the
                owner sees the pause message above the inputs and the
                missing fields are tagged with the `Required` indicator
                in their labels. The notice is removed automatically when
                every required field is filled. */}
            {missingFields.length > 0 && (
                <div
                    className={`p-4 rounded-lg border-2 border-amber-500 ${dk ? 'bg-amber-950/40' : 'bg-amber-50'}`}
                    data-form-paused-notice
                >
                    <h3 className={`font-semibold ${txPrimary}`}>
                        {L('Targets are paused until you fill the fields below.', 'الأهداف متوقفة حتى تكمل الحقول التالية.')}
                    </h3>
                    <p className={`mt-1 text-sm ${txSecondary}`}>
                        {L(
                            `Missing ${missingFields.length} field${missingFields.length === 1 ? '' : 's'}: ${missingFields.join(', ')}.`,
                            `${missingFields.length === 1 ? 'حقل ناقص' : 'حقول ناقصة'}: ${missingFields.join('، ')}.`,
                        )}
                    </p>
                </div>
            )}

            {/* Conditional fields per funnel-type */}
            {(funnelType === 'paid_event' || funnelType === 'paid_product') && (
                <div className="space-y-3">
                    <NumberField
                        label={L('Average order value ($)', 'قيمة الطلب (دولار)')}
                        value={aov}
                        onChange={setAov}
                        isDarkMode={dk}
                        required={missingFields.includes('aov')}
                        lang={lang}
                        // Phase 968 — T055 (FR-036). The order-value field
                        // carries a plain-language explanation identifying
                        // it as the average a single customer pays (so an
                        // owner with an order bump does not enter their
                        // bare ticket price). Arabic wording is the Fusha
                        // form per contracts/uiCopy.md #16 + A-10.
                        //
                        // A-10 cites the policy provenance (the guard
                        // header at scripts/sc11Guard.mjs:11 + 84:
                        // "متوسط is INTERNAL-ONLY (not in src/**). It is
                        // NOT in the pattern set here. The user-facing
                        // equivalent in stats labels is المعدل or
                        // appropriate Fusha."). The policy is deliberately
                        // absent from the regex set, so a violation would
                        // ship silently — see also research.md:127-133 for
                        // the Phase 0 decision that produced this wording.
                        hint={L('The amount one customer usually pays you', 'المبلغ الذي يدفعه العميل الواحد عادة')}
                    />
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>{L('Do you have a high-ticket offer?', 'هل لديك عرض عالي القيمة؟')}</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setHasHto(true)} className={`px-3 py-2 rounded ${hasHto ? 'bg-indigo-600 text-white' : dk ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>{L('Yes', 'نعم')}</button>
                            <button type="button" onClick={() => setHasHto(false)} className={`px-3 py-2 rounded ${!hasHto ? 'bg-indigo-600 text-white' : dk ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>{L('No', 'لا')}</button>
                        </div>
                    </div>
                    {hasHto && (
                        <>
                            <NumberField label={L('High ticket price ($)', 'سعر العرض عالي القيمة (دولار)')} value={htoPrice} onChange={setHtoPrice} isDarkMode={dk} required={missingFields.includes('htoPrice')} lang={lang} />
                            {/* Phase 968 — T045 follow-up (Item C of Phase 6
                                review): paid_event does NOT render
                                htoConversionRate. The corrected formula
                                (FR-011..FR-014) reads eventAttendanceRate
                                × eventCloseRate, not htoConversionRate.
                                Rendering the field invites the owner to
                                fill a value that changes nothing — exactly
                                the harm Item A of Phase 5's review
                                rejected. Storage retention (data-model.md
                                §1) means stored and unread, not rendered.
                                The field is still sent on the save payload
                                (default 0) for additive-storage compatibility,
                                but the form does not prompt for it. */}
                            {funnelType === 'paid_product' && (
                                <NumberField label={L('High ticket conversion rate (%)', 'نسبة تحويل العرض عالي القيمة (%)')} value={htoConversionRate} onChange={setHtoConversionRate} isDarkMode={dk} required={missingFields.includes('htoConversionRate')} lang={lang} />
                            )}
                        </>
                    )}
                    {/* Phase 968 — T045 (US3). paid_event event rates
                        (FR-011..FR-014). The corrected formula reads
                        eventAttendanceRate × eventCloseRate on the HTO
                        term. Both fields are required on paid_event
                        regardless of hasHto (when hasHto is false the
                        HTO term collapses to 0, but the fields must
                        still be present per the contract). Benchmark
                        hint copy lands in T054 (Phase 9). */}
                    <NumberField
                        label={L('Attendance from ticket buyers (%)', 'نسبة الحضور من مشتري التذاكر (%)')}
                        value={eventAttendanceRate}
                        onChange={setEventAttendanceRate}
                        isDarkMode={dk}
                        required={missingFields.includes('eventAttendanceRate')}
                        lang={lang}
                        hint={L('Typical range: 70–80%', 'المعتاد: ٧٠ – ٨٠٪')} // sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
                    />
                    <NumberField
                        label={L('High ticket close from attendees (%)', 'نسبة إغلاق العرض عالي القيمة من الحضور (%)')}
                        value={eventCloseRate}
                        onChange={setEventCloseRate}
                        isDarkMode={dk}
                        required={missingFields.includes('eventCloseRate')}
                        lang={lang}
                        hint={L('Typical range: 5–10%', 'المعتاد: ٥ – ١٠٪')} // sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
                    />
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>{L('Target ROAS', 'هدف العائد على الإنفاق الإعلاني')}</label>
                        <div className="space-y-2">
                            {ROAS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setRoasTarget(opt.value)}
                                    className={`block w-full text-right p-3 rounded border ${roasTarget === opt.value ? 'border-indigo-500 bg-indigo-900/40' : dk ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-50'}`}
                                >
                                    <div className={`font-semibold ${txPrimary}`}>{lang === 'ar' ? opt.label : opt.value + ' — ' + (
                                        opt.value === 1.0 ? 'Break-even' : opt.value === 0.65 ? 'Invest a bit' : 'Invest more'
                                    )}</div>
                                    <div className={`text-sm ${txMuted}`}>{opt.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {funnelType === 'free_webinar' && (
                <div className="space-y-3">
                    <NumberField label={L('Final offer price ($)', 'سعر العرض النهائي (دولار)')} value={offerPrice} onChange={setOfferPrice} isDarkMode={dk} required={missingFields.includes('offerPrice')} lang={lang} />
                    <NumberField label={L('Attendance rate (%)', 'نسبة الحضور من المسجلين (%)')} value={attendanceRate} onChange={setAttendanceRate} isDarkMode={dk} required={missingFields.includes('attendanceRate')} lang={lang} hint={L('Typical range: 20–30%', 'المعتاد: ٢٠ – ٣٠٪')} /* sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric" */ />
                    <NumberField label={L('Purchase rate from attendees (%)', 'نسبة الشراء من الحضور (%)')} value={buyRateFromAttendees} onChange={setBuyRateFromAttendees} isDarkMode={dk} required={missingFields.includes('buyRateFromAttendees')} lang={lang} hint={L('Typical range: 1–3%', 'المعتاد: ١ – ٣٪')} /* sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric" */ />
                </div>
            )}

            {funnelType === 'lead_magnet_call' && (
                <div className="space-y-3">
                    <NumberField label={L('Final offer price ($)', 'سعر العرض النهائي (دولار)')} value={offerPrice} onChange={setOfferPrice} isDarkMode={dk} required={missingFields.includes('offerPrice')} lang={lang} />
                    {/* Phase 968 — T023. Booking rate + show-up rate are the
                        two new lead-magnet inputs (FR-004, FR-007). The
                        close-rate label is also relabelled per
                        contracts/uiCopy.md #5: "Close rate on calls that
                        happened (%)" / "نسبة الإغلاق في المكالمات التي تمت (%)".
                        The benchmark hint copy (#2, #4, #6) lands in T054. */}
<NumberField label={L('Booking rate (%)', 'نسبة حجز المكالمات من العملاء المحتملين (%)')} value={bookingRate} onChange={setBookingRate} isDarkMode={dk} required={missingFields.includes('bookingRate')} lang={lang} hint={L('Typical range: 5–10%', 'المعتاد: ٥ – ١٠٪')} /* sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric" */ />
                    <NumberField label={L('Show-up rate (%)', 'نسبة الحضور لل مكالامات المحجوزة (%)')} value={showUpRate} onChange={setShowUpRate} isDarkMode={dk} required={missingFields.includes('showUpRate')} lang={lang} hint={L('Typical range: above 65%', 'المعتاد: أكثر من ٦٥٪')} /* sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric" */ />
                    <NumberField label={L('Close rate on calls that happened (%)', 'نسبة الإغلاق في المكالمات التي تمت (%)')} value={leadToCloseRate} onChange={setLeadToCloseRate} isDarkMode={dk} required={missingFields.includes('leadToCloseRate')} lang={lang} hint={L('Typical range: 20–25%', 'المعتاد: ٢٠ – ٢٥٪')} /* sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric" */ />
                </div>
            )}

            {/* Phase 968 — T028 + T029. Sales-commission field + marginKept
                three-button preset. Apply to every funnel branch (FR-023,
                FR-024, FR-025, FR-025a, FR-018 OQ-1 override). The preset
                follows the ROAS_OPTIONS pattern (lines 315-319 / 720-740);
                60 is preselected for a new record (DEFAULT_MARGIN_KEPT). */}
            <div className="space-y-3">
                <NumberField
                    label={L('Sales commission (%)', 'عمولة المبيعات (%)')}
                    value={commissionRate}
                    onChange={setCommissionRate}
                    isDarkMode={dk}
                    required={missingFields.includes('commissionRate')}
                    lang={lang}
                    hint={L('Typical: 10%', 'المعتاد: ١٠٪')} // sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
                />
                <div>
                    <label className={`block text-sm font-medium mb-1 ${txSecondary}`}>
                        {L('Margin you want to keep (%)', 'نسبة الربح التي تريد الاحتفاظ بها (%)')}
                    </label>
                    <div className="space-y-2">
                        {MARGIN_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setMarginKept(opt.value)}
                                className={`block w-full text-right p-3 rounded border ${marginKept === opt.value ? 'border-indigo-500 bg-indigo-900/40' : dk ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-50'}`}
                            >
                                <div className={`font-semibold ${txPrimary}`}>
                                    {lang === 'ar'
                                        ? opt.labelAr
                                        : String(opt.value) + ' — ' + opt.subEn}
                                </div>
                                <div className={`text-sm ${txMuted}`}>
                                    {lang === 'ar' ? opt.subAr : opt.subEn}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="w-full px-4 py-3 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
                {loading ? L('Saving…', 'جاري الحفظ…') : L('Save settings', 'حفظ الإعدادات')}
            </button>

            {/* Phase 968 — T046/T048: paid_event dual-path results card.
                Shows BOTH rawTargetCpa (ticket revenue path) and
                maxCpa (projection path) plus the active-path
                explainer. Suppressed when the record is
                incomplete (missingFields.length > 0) so the
                paused-targets notice is the only thing the owner
                sees. paid_product, lead_magnet_call, free_webinar
                use the single-figure card below (T047). */}
            {paidDerived && settings?.funnelType === 'paid_event' && missingFields.length === 0 && (
                <div className={`p-4 rounded-lg border ${cardBg}`} data-results-card-paid-event>
                    <h3 className={`font-semibold mb-2 ${txPrimary}`}>{L('Results', 'النتائج')}</h3>
                    <p className={`text-base ${txPrimary}`}>
                        {L('Maximum cost per customer:', 'أقصى تكلفة للعميل:')} ${paidDerived.effectiveTargetCpa.toFixed(2)}
                    </p>
                    <p className={`mt-3 text-sm ${txSecondary}`}>
                        {L('Based on ticket revenue:', 'محسوب على إيراد التذاكر:')} ${paidDerived.rawTargetCpa.toFixed(2)}
                    </p>
                    <p className={`mt-1 text-sm ${txSecondary}`}>
                        {L('Based on projected event value:', 'محسوب على القيمة المتوقعة للفعالية:')} ${paidDerived.maxCpa.toFixed(2)}
                    </p>
                    <p className={`mt-3 text-sm ${txMuted}`} data-results-active-path>
                        {paidDerived.capApplied
                            ? L(
                                'Your target follows projected event value, because your back-end economics (event attendance × high-ticket close) are now the binding constraint.',
                                'هدفك محسوب على القيمة المتوقعة للفعالية، لأن اقتصاديات الـ back-end (نسبة الحضور × نسبة الإغلاق) هي القيد الفعّال.',
                            )
                            : L(
                                'Your target follows ticket revenue, because the later value of your event is not proven yet.',
                                'هدفك محسوب على إيراد التذاكر، لأن قيمة العرض التالي في فعاليتك لم تثبت بعد.',
                            )}
                    </p>
                    {paidDerived.capApplied && (
                        <div className={`mt-3 p-3 rounded border-2 border-yellow-500 ${dk ? 'bg-yellow-950/40' : 'bg-yellow-50'}`}>
                            <p className={`text-sm ${txPrimary}`}>
                                {L(
                                    'Reminder: your funnel economics are very tight. Re-check your numbers or talk to us.',
                                    'تذكير: أرقام مسارك الاقتصادي ضيقة جداً. راجع الأرقام أو تواصل معنا.',
                                )}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Single-figure results card for paid_product, free_webinar,
                and lead_magnet_call (T047). Suppressed when incomplete
                (T048) so the paused-targets notice is the only thing
                the owner sees. */}
            {paidDerived && settings?.funnelType !== 'paid_event' && missingFields.length === 0 && (
                <div className={`p-4 rounded-lg border ${cardBg}`}>
                    <h3 className={`font-semibold mb-2 ${txPrimary}`}>{L('Results', 'النتائج')}</h3>
                    <p className={`text-base ${txPrimary}`}>
                        {L('Maximum cost per customer:', 'أقصى تكلفة للعميل:')} ${paidDerived.effectiveTargetCpa.toFixed(2)}
                    </p>
                    <p className={`mt-2 text-sm ${txMuted}`}>
                        {L(
                            'If your ad brings customers for less than this, it is successful. If more — it needs adjustment.',
                            'إذا كان إعلانك يجلب عملاء بأقل من هذا المبلغ — فهو ناجح. إذا بأكثر — يحتاج تعديل.',
                        )}
                    </p>
                    {paidDerived.capApplied && (
                        <div className={`mt-3 p-3 rounded border-2 border-yellow-500 ${dk ? 'bg-yellow-950/40' : 'bg-yellow-50'}`}>
                            <p className={`text-sm ${txPrimary}`}>
                                {L(
                                    'Reminder: your funnel economics are very tight. Re-check your numbers or talk to us.',
                                    'تذكير: أرقام مسارك الاقتصادي ضيقة جداً. راجع الأرقام أو تواصل معنا.',
                                )}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {freeDerived && missingFields.length === 0 && (
                <div className={`p-4 rounded-lg border ${cardBg}`}>
                    <h3 className={`font-semibold mb-2 ${txPrimary}`}>{L('Results', 'النتائج')}</h3>
                    <p className={`text-base ${txPrimary}`}>
                        {L('Maximum cost per lead:', 'أقصى تكلفة للليد:')} ${freeDerived.effectiveTargetCpl.toFixed(2)}
                    </p>
                    <p className={`mt-2 text-sm ${txMuted}`}>
                        {L(
                            'If your ad brings leads for less than this, it is successful. If more — it needs adjustment.',
                            'إذا كان إعلانك يجلب ليدز بأقل من هذا المبلغ — فهو ناجح. إذا بأكثر — يحتاج تعديل.',
                        )}
                    </p>
                </div>
            )}

            {/* Monthly-review prompt (dismissible, non-blocking) */}
            {reviewDue && !reviewDismissed && (
                <div className={`p-3 rounded border ${cardBg} flex items-center justify-between gap-2`}>
                    <p className={`text-sm ${txSecondary}`}>{L('Monthly review due — confirm your values are still accurate.', 'مراجعة شهرية مستحقة — تأكد من تحديث القيم إذا تغيرت أسعار العرض.')}</p>
                    <button
                        type="button"
                        aria-label={L('Dismiss review reminder', 'إخفاء تذكير المراجعة')}
                        className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
                        onClick={() => setReviewDismissed(true)}
                    >
                        {L('Dismiss', 'إخفاء')}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Small helper component ─────────────────────────────────

function NumberField({
    label,
    value,
    onChange,
    isDarkMode,
    required,
    lang,
    hint,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    isDarkMode: boolean;
    /** Phase 968 — T038 (FR-052). When true, render a `Required`
        marker next to the label so the owner can tell which inputs
        block the save. */
    required?: boolean;
    /** Phase 968 — Item B fix (carried from batch-05 review). The
        Required marker is bilingual — driven by language, NOT theme.
        Arabic-speaking users in dark mode should see `مطلوب`,
        English-speaking users in light mode should see `Required`.
        The previous version keyed this off `isDarkMode`, which is a
        theme flag, not a language flag. */
    lang: string;
    /** Phase 968 — T053 (US6, FR-034). Optional muted text rendered
        below the input, NOT as a placeholder. The hint survives the
        owner beginning to type (placeholders disappear at the exact
        moment the owner needs them — FR-034's explicit rationale).
        Owner guidance copy (typical range, plain-language meaning)
        flows through here. */
    hint?: string;
}) {
    const inputCls = isDarkMode
        ? 'bg-slate-800 border-slate-700 text-white'
        : 'bg-white border-slate-300 text-slate-900';
    const labelCls = isDarkMode ? 'text-slate-300' : 'text-slate-700';
    // Phase 968 — T053 (FR-034). Hint text uses the same muted tone
    // already used elsewhere in the form (results-card sub-lines,
    // paired-meta sub-labels) so the guidance reads as form copy, not
    // as a new visual element. `txMuted` was passed in via the
    // parent at `:404` and inherits the theme there.
    const hintCls = isDarkMode ? 'text-slate-400' : 'text-slate-500';
    // Language-driven: 'ar' → Arabic, otherwise English. Phase 9
    // (T057) moves the string into i18n.tsx as a catalogued key;
    // until then this inline ternary is the source of truth.
    const requiredText = lang === 'ar' ? 'مطلوب' : 'Required';
    return (
        <div>
            <label className={`block text-sm font-medium mb-1 ${labelCls}`}>
                {label}
                {required ? (
                    <span
                        className={`ms-2 text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}
                        data-form-required-marker
                    >
                        {`(${requiredText})`}
                    </span>
                ) : null}
            </label>
            <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full p-2 rounded border ${inputCls}`}
            />
            {hint ? (
                <p
                    className={`mt-1 text-xs ${hintCls}`}
                    data-form-field-hint
                >
                    {hint}
                </p>
            ) : null}
        </div>
    );
}