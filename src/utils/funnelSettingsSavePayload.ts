// src/utils/funnelSettingsSavePayload.ts — pure save-payload helpers
// ═══════════════════════════════════════════════════════════════════════════
//
// Phase 968 — Phase 10 Item D (frontend test for the save payload's
// htoConversionRate null pass-through on paid_event). Extracted from
// FunnelSettingsForm.tsx's `handleSave` so the logic is unit-testable
// in isolation. The form imports this helper; the test imports the
// same helper.
//
// The save payload's `htoConversionRate` depends on funnel type:
//
//   - paid_event:  the form's input is hidden (Phase 7 Item C), so the
//     state is always empty. The save sends the hydrated settings
//     value verbatim — a stored number passes through, a stored `null`
//     stays `null`, an unset record carries `null` (storage retention
//     default per data-model.md §1). Sending `0` would overwrite a
//     pre-existing value with `0` and break the revert-stays-code-
//     only property the deferred epoch phase relies on.
//
//   - paid_product: the form reads the input directly; an empty
//     string coerces to `0` (paid_product requires the field as a
//     number — `0` is a legitimate answer: zero upsell-conversion
//     rate ⇒ no HTO revenue contribution).
//
// Other funnel types (free_webinar / lead_magnet_call) do not carry
// the field on the save payload; the form omits it entirely. This
// helper's `else` branch defaults to `0` as a defensive default for
// any future paid-type funnel that might be added without updating
// this helper, matching the existing `buildFunnelInputs` fallback
// at `functions/src/funnelSettings.ts`.
//
// Pure: takes the funnel type, the form's state (string-typed), and
// the hydrated settings value, and returns what the save payload
// should carry. Mirrors the backend's
// `resolveHtoConversionRateForStorage` shape so the chain reads the
// same way on both sides (constitution XI).
import type { FunnelType } from '../components/FunnelSettingsForm';

export function resolveHtoConversionRateForSave(
    funnelType: FunnelType,
    stateValue: string,
    settingsValue: number | null | undefined,
): number | null {
    if (funnelType === 'paid_event') {
        // The input is hidden on paid_event — state is always ''.
        // Send the hydrated settings value verbatim: number passes
        // through, null stays null, undefined collapses to null.
        // `?? 0` is INTENTIONALLY absent — it would coerce null to 0
        // and reintroduce the Item D bug.
        return settingsValue ?? null;
    }
    // paid_product: numeric input. Empty string coerces to 0 (the
    // existing form behavior — paid_product requires the field as
    // a number, so we apply the `0` default rather than rejecting
    // the save). Defensive for any other paid-type funnel: same
    // shape, same default.
    if (stateValue === '') return 0;
    const n = Number(stateValue);
    return Number.isFinite(n) ? n : 0;
}