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
//   - paid_product:  Phase 11 — paid_product no longer reads
//     `htoConversionRate` (the chain replaces it). The form removed
//     the input (no rendered field ⇒ state is always ''). The save
//     payload still carries the hydrated settings value verbatim for
//     storage retention (the doc slot stays populated so a future
//     phase that re-introduces the field doesn't lose historical
//     data). Coercion rules are identical to paid_event: number
//     passes through, null stays null, undefined collapses to null.
//
// Other funnel types (free_webinar / lead_magnet_call) do not carry
// the field on the save payload; the form omits it entirely. The
// helper's defensive `else` branch (paid_product's old "numeric
// coercion" path) is retained because callers still invoke it for
// paid_product today (the form removes the input but the state slot
// is preserved in case a future refactor restores a paid_product
// numeric input — matches the existing `buildFunnelInputs` fallback
// at `functions/src/funnelSettings.ts`).
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
    if (funnelType === 'paid_product') {
        // Phase 11 — paid_product's input is also removed (the
        // chain replaces it). Same null pass-through as paid_event:
        // the doc slot is preserved verbatim for storage retention
        // (data-model.md §1) — the form's state is always '' because
        // there is no input. Hydrated value passes through; null
        // stays null; undefined collapses to null.
        return settingsValue ?? null;
    }
    // Non-paid funnel types land here defensively. The form omits the
    // field entirely on free_webinar / lead_magnet_call (the chain
    // carries the close-rate signal for lead_magnet_call; free_webinar
    // uses buyRateFromAttendees). Match the existing buildFunnelInputs
    // `?? 0` fallback so a future paid-type funnel that lands here
    // doesn't silently null out the doc slot.
    if (stateValue === '') return 0;
    const n = Number(stateValue);
    return Number.isFinite(n) ? n : 0;
}