# Bug Investigation — paid_product form rendered wrong field set

**Feature**: `968-funnel-economics-rebuild`
**Date**: 2026-09-01
**Bug class**: production form defect — wrong field set rendered per funnel type
**Severity**: high — paid_product owners were configuring math their funnel doesn't run

---

## 1. Symptom (production report)

A production owner of a `paid_product` funnel reported that the funnel settings form rendered the wrong fields. They saw:

- "Attendance from ticket buyers (%)" — a `paid_event` field (ticket → attendee). Their funnel has no tickets; they sell a course / tool / template.
- "High ticket close from attendees (%)" — also `paid_event`-only (attendee → HTO close).
- "High ticket conversion rate (%)" — a single legacy rate that paid_product used to read, but only when hasHto=true.

And did NOT see:

- A booking rate.
- An attendance rate on the booked calls.
- A close rate on attended calls.

The chain their funnel actually runs (`buyer → booked → attended → HTO close`) had no inputs on the form.

---

## 2. Root cause

`src/components/FunnelSettingsForm.tsx:1104-1119` (pre-fix) gated the entire paid branch by a single condition:

```tsx
{(funnelType === 'paid_event' || funnelType === 'paid_product') && (
    <div className="space-y-3">
        <NumberField label={L('Average order value ($)', ...)} ... />
        ... hasHto toggle ...
        {hasHto && (
            <>
                <NumberField label={L('High ticket price ($)', ...)} ... />
                {funnelType === 'paid_product' && (
                    <NumberField label={L('High ticket conversion rate (%)', ...)} ... />
                )}
            </>
        )}
        <NumberField label={L('Attendance from ticket buyers (%)', ...)} ... />
        <NumberField label={L('High ticket close from attendees (%)', ...)} ... />
        <div>... Target ROAS ...</div>
    </div>
)}
```

`eventAttendanceRate` and `eventCloseRate` were rendered **unconditionally** inside the shared block. Only `htoConversionRate` had a paid_product-specific guard. The bug is structural: the JSX was never split, so anything added to `paid_event` automatically leaks into `paid_product` until someone remembers the per-type guard.

---

## 3. Why the test gap existed

The pre-fix tests asserted what fields are **required for completeness** (the missing-field predicate) but not what fields are **rendered** by the form. A field can be required in storage without being rendered in the UI — those are independent properties. The pre-fix tests exercised the storage side; the render side had no positive *and* negative test per funnel type, so a regression that added an event-rate field to paid_product passed silently.

The user's explicit framing of the requirement:

> "negative requirements ('must not render X') need positive tests, and this defect existed because that one didn't"

`src/__tests__/funnelSettingsRender.test.tsx` (Phase 11 — new) is the regression test for this class of bug. It mounts the form for every funnel type and asserts both:

- **POSITIVE** requirements — the correct fields ARE rendered.
- **NEGATIVE** requirements — the wrong fields are NOT rendered.

A future regression that re-adds `eventAttendanceRate` to the paid_product branch (or any other paid_event field) trips the negative test for `paid_product` immediately.

---

## 4. Correct field set per funnel type (the contract)

The user spec for `paid_product` ("low price offer") is the chain `sale → booking → attendance → HTO close`:

| Position | Field | Storage name | Source |
|---|---|---|---|
| 1 | Average order value ($) | `aov` | shared with paid_event |
| 2 | Target ROAS | `roasTarget` | shared with paid_event |
| 3 | High ticket price ($) | `htoPrice` | shared with paid_event (gated by hasHto) |
| 4 | Booking rate (buyers who book a call) | `bookingRate` | **NEW** (Phase 11) — was `null` on paid_product before |
| 5 | Attendance rate (booked calls that happen) | `showUpRate` | **NEW** (Phase 11) — was `null` on paid_product before |
| 6 | High ticket close rate (attended calls that buy) | `leadToCloseRate` | **NEW** (Phase 11) — was `null` on paid_product before |
| 7 | Sales commission | `commissionRate` | shared (Phase 968 T027) |
| 8 | Margin you want to keep | `marginKept` | shared (Phase 968 T029) |

Formula:

```
fullBuyerValue = aov + htoPrice × netFactor × bookingRate × showUpRate × leadToCloseRate
```

This is the same shape `lead_magnet_call` uses on its `leadValue` term (Phase 968 T022), applied to buyers instead of leads. The user's instruction was to mirror that treatment: "the way the other funnel types replaced their single-rate fields with explicit chains".

The other three funnel types (`paid_event`, `free_webinar`, `lead_magnet_call`) are unchanged.

---

## 5. Storage shape — additive on the doc

Reusing `bookingRate`, `showUpRate`, `leadToCloseRate` for paid_product keeps the storage additive (data-model.md §1: "no field is renamed, cleared, or deleted"). The same doc slot serves both funnel types with funnelType-discriminated semantics:

| Storage field | `paid_product` semantic (Phase 11) | `lead_magnet_call` semantic (Phase 968 T022) |
|---|---|---|
| `bookingRate` | buyers → booked call | leads → booked call |
| `showUpRate` | booked → attended | booked → attended |
| `leadToCloseRate` | attended → HTO close | attended → close |

`htoConversionRate` stays on the doc shape for storage retention (Phase 7 Item C / data-model.md §1) — every funnel type carries the slot, but the derivation no longer reads it on any funnel type (Phase 11). The form's save payload still passes the stored value verbatim through `resolveHtoConversionRateForSave` so the doc slot is preserved across saves.

---

## 6. Fix summary

### Frontend (`src/components/FunnelSettingsForm.tsx`)

- **Renamed** `paid_product` label: `'Paid Product' / 'منتج مدفوع'` → `'Low price offer (course, tool, etc.)' / 'عرض منخفض السعر (دورة، أداة، وغيره)'`.
- **Split** the paid branch into two: `{funnelType === 'paid_event' && (...)}` and `{funnelType === 'paid_product' && (...)}`. Each branch renders its own field set; there is no shared JSX block to leak into either side.
- **paid_product** branch renders AOV, ROAS, hasHto toggle, htoPrice (when hasHto), and the new chain inputs (booking / show-up / close when hasHto). No event-rate fields, no legacy `htoConversionRate` input.
- **paid_event** branch unchanged except: `htoConversionRate` input is fully removed (the field's storage retention was already handled by the save-payload helper).
- **`computeMissingFields`** updated: paid_product + hasHto now requires `bookingRate`, `showUpRate`, `leadToCloseRate` (replacing the legacy `htoConversionRate` requirement).

### Backend (`functions/src/cpaEconomics.ts` + `functions/src/funnelSettings.ts`)

- **`PaidFunnelInputs`** gained `bookingRate`, `showUpRate`, `leadToCloseRate` fields. `htoConversionRate` retained for type compatibility but no longer read at derivation time.
- **`deriveTargetCpa`** for `paid_product`: `fullBuyerValue = aov + htoPrice × netFactor × (bookingRate / 100) × (showUpRate / 100) × (leadToCloseRate / 100)`. Matches the spec formula exactly.
- **`assertPaidInput`** validates the new chain on paid_product (range checks 0..100).
- **`assertRequiredFieldPresent`**, **`requiredFieldsForDoc`**, **`missingRequiredFields`** for paid_product: the chain replaces htoConversionRate. paid_event unchanged (still does not require htoConversionRate — Item A asymmetry preserved).
- **`buildFunnelInputs`**: the request payload now carries the chain for both paid types; paid_event ignores, paid_product reads.
- **Doc construction**: `bookingRate` / `showUpRate` / `leadToCloseRate` are persisted on `lead_magnet_call` AND `paid_product` docs; `null` on every other funnel type.

### Frontend save-payload helper (`src/utils/funnelSettingsSavePayload.ts`)

- **`resolveHtoConversionRateForSave`** for `paid_product` now passes through the hydrated settings value verbatim (same null pass-through behavior as `paid_event`). The legacy "form input is the source of truth" branch is retained as a defensive default for any future paid-type funnel.

### Tests

- **`src/__tests__/funnelSettingsRender.test.tsx`** (NEW, 16 tests): mount-based assertion of which labels render for every funnel type. Positive requirements ("must render X") and negative requirements ("must not render Y") per funnel type. The load-bearing test is `paid_product NEGATIVE: must NOT render paid_event's eventAttendanceRate / eventCloseRate (the production defect)` — this test failed on the pre-fix form and passes after the fix.
- **`src/__tests__/funnelCompleteness.test.ts`**: fixtures updated; the legacy "paid_product requires htoConversionRate" test is replaced with "paid_product requires the chain (booking/show-up/close)". Added a new test pinning that `htoConversionRate` is NOT required on any funnel type.
- **`src/__tests__/funnelSettingsSavePayload.test.ts`**: paid_product section rewritten to assert the new null-pass-through contract (matches paid_event's behavior; the form's input is hidden so state is always '').
- **`functions/src/__tests__/cpaEconomics.test.ts`**: fixtures updated to carry the new chain fields; the FR-019 discriminator test now uses chain rates (25/80/25, product 0.05) to reproduce the same `fullBuyerValue = 235` as the legacy fixture.
- **`functions/src/__tests__/funnelEconomicsParity.test.ts`**: paid_product parity fixtures updated for the chain; the "missing htoConversionRate" test is replaced with "missing chain" (lists all three fields).
- **`functions/src/__tests__/funnelSettings.contract.test.ts`**: the contract test helper `assertRequiredFieldsPresent` updated to include the chain fields on paid_product + hasHto; legacy `htoConversionRate` requirement removed.

---

## 7. Test results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `vitest` (frontend) | 81 | 81 | 0 |
| `npm run test` (backend full) | 14 suites | 14 | 0 |
| SC-11 terminology guard | 85 files | pass | 0 forbidden terms |

The frontend render test (`funnelSettingsRender.test.tsx`) was run against the pre-fix code first to confirm it catches the production defect:

- 7 of 16 tests failed on pre-fix code, with the load-bearing failures all on `paid_product`:
  - "paid_product POSITIVE: Booking rate (%) expected true, got false" — chain not rendered.
  - "paid_product NEGATIVE: Attendance from ticket buyers (%) expected false, got true" — paid_event field leaked.
  - "paid_product NEGATIVE: High ticket conversion rate (%) expected false, got true" — legacy field still there.

After the fix: 16/16 pass.

---

## 8. Risk surface

| Risk | Mitigation |
|---|---|
| Existing paid_product owners who already saved a record with `htoConversionRate` populated — their value stays on the doc (storage retention, Phase 7 Item C). The derivation no longer multiplies by it; the chain takes over. | The save payload helper preserves `null` pass-through; no field is overwritten on save. |
| Existing paid_product owners whose records are now incomplete (they have `htoConversionRate` but no chain) — the paused-targets notice will list the missing chain fields. | Standard `data-model.md §3` / FR-052 behavior. No migration; the user explicitly required no implicit values (FR-040). |
| `paid_event` owners — the form's render and the doc shape are unchanged for them. | Verified by `funnelSettingsRender.test.tsx paid_event POSITIVE / NEGATIVE` — both pass without modification. |
| The `coercePaid` helper in `funnelSettings.contract.test.ts` defaults the new chain fields to 0 for paid_event-shaped fixtures — the derivation ignores them on paid_event, so the existing contract test values are unchanged. | The contract test re-uses `coercePaid` for paid_event-shaped inputs; paid_product contract tests use `assertRequiredFieldsPresent` directly. Both pass. |

---

## 9. What was deferred

- The economic epoch work (Item 11 in the original investigation) — unchanged. The deferred epoch phase will touch the same document; this fix doesn't affect that path.
- The funnel-type taxonomy — still 4 closed values (`paid_event`, `paid_product`, `free_webinar`, `lead_magnet_call`). The label rename is presentation only; the underlying literal is unchanged.

---

## 10. Files touched

| File | Change |
|---|---|
| `src/components/FunnelSettingsForm.tsx` | Label rename, branch split, new fields, hydration, save, MISSING_FIELD_LABELS, computeMissingFields |
| `src/utils/funnelSettingsSavePayload.ts` | paid_product null-pass-through contract |
| `src/__tests__/funnelSettingsRender.test.tsx` | **NEW** — mount-based rendered-field-set test |
| `src/__tests__/funnelCompleteness.test.ts` | Fixture rewrite + new chain requirement test |
| `src/__tests__/funnelSettingsSavePayload.test.ts` | paid_product section rewrite |
| `functions/src/cpaEconomics.ts` | `PaidFunnelInputs` gains chain fields, derivation update, validation |
| `functions/src/funnelSettings.ts` | Doc shape, validators, buildFunnelInputs, doc construction |
| `functions/src/__tests__/cpaEconomics.test.ts` | Fixture migration (30 sites) + FR-019 discriminator rewrite |
| `functions/src/__tests__/funnelSettings.contract.test.ts` | Fixture migration (7 sites) + chain contract test |
| `functions/src/__tests__/funnelEconomicsParity.test.ts` | paid_product parity fixtures |
| `scripts/patch-paid-funnels.mjs` | **NEW** — idempotent migration tool for test fixtures (run once; idempotent for future re-runs) |

The bug is closed. The regression test guards against re-introducing it.

— Phase 11 (production-bug batch)