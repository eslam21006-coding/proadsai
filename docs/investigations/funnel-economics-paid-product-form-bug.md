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

---

## 11. Phase 12 review (B + C)

### Item C — patch script (deleted)

`scripts/patch-paid-funnels.mjs` was the one-off migration tool that batch-applied
`bookingRate: 0, showUpRate: 0, leadToCloseRate: 0,` to every `PaidFunnelInputs`
literal in `cpaEconomics.test.ts` (30 sites) and `funnelSettings.contract.test.ts`
(7 sites) when the `PaidFunnelInputs` type gained those three fields. It was a
regex-based insertion script — find `htoConversionRate: \d+,` and append the chain
fields on the next line.

**Status: deleted** (commit `3611a30` reverted the file; this report records what
it did so the migration is documented without leaving a foot-gun in the repo).
Reasons:

- The script is not idempotent against current state — it would re-append
  `bookingRate: 0, ...` to fixtures that have since been manually adjusted
  with intentional non-zero values (the FR-019 discriminator on line 173
  uses `bookingRate: 25`; the second-discriminator fixture on line 207 uses
  `bookingRate: 7.5`). Re-running it would produce a TypeScript error on
  duplicate-property literal types.
- The migration is one-shot. There is no recurring batch of test fixtures to
  update against this type. A committed script that rewrites test fixtures
  against a stale view of those fixtures is a trap — a future engineer who
  sees it and runs it will silently corrupt the assertions.
- The patch was mechanical and trivially reproducible by hand — see the diff
  in commit `3611a30` for the exact insertions.

If a similar migration is needed in the future (e.g. Item A below adds three
new fields to `PaidFunnelInputs`), write a new script, run it once, and
delete it in the same commit.

### Item B — second FR-019 discriminator

The first FR-019 fixture tunes the chain rates so the product is exactly 0.05
(25 × 80 × 25 / 100² = 0.05) — useful for the 235-continuity anchor with the
Phase 968 contract, but a poor structural discriminator. A regression that
dropped one stage and doubled another (e.g. `(0.5 × 80 × 25)` → product 0.10)
would still produce a different-but-coincidentally-acceptable `fullBuyerValue`.

`functions/src/__tests__/cpaEconomics.test.ts:206` (new test) pins a chain
product with a non-round arithmetic and asserts each stage matters
independently:

- base rates: `7.5 × 70 × 22.5` → product 0.0118125 → `fullBuyerValue = 131.89`
- drop `bookingRate` → `0` → `fullBuyerValue = 100` (aov alone; chain collapses)
- drop `showUpRate` → `0` → same collapse
- drop `leadToCloseRate` → `0` → same collapse
- double `bookingRate` (15 × 70 × 22.5) → HTO contribution ≈ 2× original
  (tolerance 0.02 to absorb the FR-048 cent-level rounding)

A regression that removed any chain stage fails the corresponding drop-line
assertion. A regression that changed the formula to additive or squared fails
the doubling assertion.

### Item A — storage-slot overload (cost report, awaiting go-ahead)

**Problem.** Phase 11 reused the `bookingRate` / `showUpRate` / `leadToCloseRate`
storage slots on both `lead_magnet_call` and `paid_product`. Same field name,
different semantic — and the denominators are different populations:

- `lead_magnet_call.bookingRate` = "leads who book a call" — denominator is
  free opt-ins (the "lead" pool). Magnitude typically 5–10% per the Phase 968
  benchmark.
- `paid_product.bookingRate` = "buyers who book a call" — denominator is
  paying customers (the "buyer" pool). Magnitudes may differ significantly
  from lead-side rates because the population has already self-selected for
  purchase intent.

Any consumer that reads these fields without carrying `funnelType` alongside
will silently average incompatible rates. The deferred epoch work
(report §11 item 11) and the learning aggregates (`learningAggregates.ts`,
`learningIntegration.ts`) both read the funnel settings doc. An aggregate
that groups by `bookingRate` without first filtering by `funnelType` produces
a meaningless average that goes into the next-day verdict and the
retrospective aggregate in lockstep.

The "additive storage" rule (data-model.md §1: "nothing is written to any
existing document") forbids overloading by repurpose, but it allows adding
new slots. The fix is to give `paid_product` its own three slots, leaving
`lead_magnet_call`'s slots untouched.

**Proposed rename.** Distinct fields for `paid_product`, prefix-named after
the funnel-type literal so the storage slot reads cleanly with its semantic:

**Naming choice (revised after review).** Reviewer selected
`productBookingRate` / `productShowUpRate` / `productCloseRate` —
matching the `eventAttendanceRate` / `eventCloseRate` convention
already used by `paid_event`. The codebase's convention for
funnel-scoped chain fields is `<funnel-prefix><Stage>Rate` — `paid_event`
uses `event*`, so `paid_product` uses `product*`. Same shape, same
problem, same solution.

Reviewer's correction to my earlier claim: I wrote that `hto` would
"introduce an abbreviation convention the codebase doesn't already use".
That is false — `htoPrice`, `htoConversionRate`, and `hasHto` are all live
fields. The actual reason `hto` is wrong is that `paid_event`'s chain
also feeds the high-ticket offer (via `eventAttendanceRate ×
eventCloseRate` on the HTO term), so giving the `paid_product` chain an
`hto*` prefix would put two different prefixes on the same concept. The
`product*` prefix sidesteps that — same pattern as `event*`, no overlap
with the existing `hto*` fields (which describe the HTO offer itself,
not the chain that leads to it).

The original proposal (`pp`) is rejected for the same reason the
reviewer gave: cryptic, no precedent. `lowPrice` is rejected for
verbosity. `product*` wins on both readability and precedent.

**Deployment status — Phase 11 has NOT been deployed.** Verified via
`git ls-remote origin`:

```
refs/heads/main                            → 1ec5821 (funnel-economics investigation commit)
refs/heads/funnel-economics-rebuild        → 1ec5821 (same)
refs/heads/968-funnel-economics-rebuild    → 3611a30 (Phase 11 fix)
```

`main` and the legacy `funnel-economics-rebuild` branch both point at
`1ec5821` — the original Phase 968 investigation report, with no
Phase 968 (and therefore no Phase 11) code. The Phase 968 chain code
(including `bookingRate` / `showUpRate` / `leadToCloseRate` for
`lead_magnet_call`) lives entirely on the feature branch and has never
been merged or deployed.

Cross-check on `main`'s `paid_product` shape: `funnelSettings.ts` on
`main` knows only `htoConversionRate` on `paid_product` — the legacy
single-rate field. There are no `bookingRate` / `showUpRate` /
`leadToCloseRate` slots on `main` for any funnel type. A paid_product
record in production therefore can carry at most a value in the
`htoConversionRate` slot, which is being renamed off of by Phase 11
itself (the field becomes dead at read time). No record in production
carries buyer-semantic values in the `bookingRate` slot — that slot
was never written by production code.

**Conclusion: clean rename, no defensive read-side fallback needed.**
The Phase 11 build has not been deployed to production; no production
record can carry buyer-semantic values in any of the slots being
renamed. The rename is purely additive (the new slots start as `null`
on every doc; old slot values, if any existed, are abandoned).

If the situation changes — Phase 11 ships to production before this
rename merges — the same-day defensive fallback is:

```ts
const productBookingRate = doc.productBookingRate ?? doc.bookingRate ?? null;
const productShowUpRate   = doc.productShowUpRate   ?? doc.showUpRate   ?? null;
const productCloseRate    = doc.productCloseRate    ?? doc.leadToCloseRate ?? null;
```

at the read site (`getFunnelSettings`); a `saveFunnelSettings` then
backfills the new slots and clears the old ones. Marked for removal
after one release cycle. Not implementing now because the precondition
(deployment) doesn't hold.

**Cost (revised, confirmed unchanged).**

| File | Change | Approx lines |
|---|---|---|
| `functions/src/cpaEconomics.ts` | Replace `bookingRate` / `showUpRate` / `leadToCloseRate` on `PaidFunnelInputs` with `productBookingRate` / `productShowUpRate` / `productCloseRate`; update derivation; update validation. | ~30 |
| `functions/src/funnelSettings.ts` | Rename on `FunnelSettingsDoc`, `SaveFunnelSettingsRequest`, `assertRequiredFieldPresent`, `requiredFieldsForDoc`, `missingRequiredFields`, `buildFunnelInputs`, and doc construction. Set `product*` fields on `paid_product` docs only; `null` everywhere else. The `lead_magnet_call` arm stays verbatim — it does not read or write the new `product*` fields. | ~100 |
| `src/components/FunnelSettingsForm.tsx` | Rename the three `useState` hooks; update hydration, save payload, `computeMissingFields`, `MISSING_FIELD_LABELS`. Label copy unchanged ("Booking rate (%)" / "Attendance rate (%)" / "High ticket close rate (%)"). | ~150 |
| `functions/src/__tests__/cpaEconomics.test.ts` | Rename on `paidProductInputs` helper + FR-019 fixtures + second-discriminator fixtures + new `PaidFunnelInputs` literals. | ~40 |
| `functions/src/__tests__/funnelEconomicsParity.test.ts` | Rename on `paid_product` parity fixtures + `FSL` shape. | ~25 |
| `functions/src/__tests__/funnelSettings.contract.test.ts` | Rename on `coercePaid` request shape + `assertRequiredFieldsPresent` FIELD_MAP + doc-shape fixture. | ~25 |
| `src/__tests__/funnelCompleteness.test.ts` | Rename on `PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION` + `COMPLETE_PAID_PRODUCT` fixtures + assertions. | ~30 |
| `src/__tests__/funnelSettingsSavePayload.test.ts` | Rename on `paid_product` section. | ~30 |

**Total: ~430 lines across 7 files. ~30–45 minutes focused.**

**What does not change.** `src/__tests__/funnelSettingsRender.test.tsx` (the
mount-based rendered-field-set test) needs no change — it asserts on label
copy ("Booking rate (%)" etc.), which is unchanged; only the storage name
moves. The SC-11 terminology guard continues to pass (the new field names
are internal; no user-facing strings change).

**Status: implemented and verified.** All three blockers cleared: prefix
choice (`product*` — matches the `event*` convention used by paid_event),
naming rationale (no overlap with existing `hto*` fields on the HTO offer
itself), deployment status (Phase 11 undeployed ⇒ clean rename, no
defensive read-side fallback). The implementation landed across:

| File | Change |
|---|---|
| `functions/src/cpaEconomics.ts` | `PaidFunnelInputs` gained `productBookingRate` / `productShowUpRate` / `productCloseRate`; the `paid_product` branch of `deriveTargetCpa` now multiplies by the new chain; `assertPaidInput` validates the new fields on paid_product. |
| `functions/src/funnelSettings.ts` | `FunnelSettingsDoc` gained the three `product*` slots (scoped to paid_product, `null` everywhere else); `assertRequiredFieldPresent`, `requiredFieldsForDoc`, `missingRequiredFields`, `buildFunnelInputs`, and the doc construction all carry the new names; the lead-side `bookingRate` / `showUpRate` / `leadToCloseRate` slots are unchanged on lead_magnet_call. |
| `src/components/FunnelSettingsForm.tsx` | Three new `useState` hooks, three new hydration entries, three new save-payload entries, three new `NumberField` inputs on the paid_product branch with the user-visible labels "Booking rate (%)" / "Attendance rate (%)" / "High ticket close rate (%)"; `computeMissingFields` checks the new fields on paid_product + hasHto; `MISSING_FIELD_LABELS` adds the three new keys; the optimistic merge writes the new slots on paid_product docs only. |
| Backend tests | `cpaEconomics.test.ts` (33 sites updated), `funnelEconomicsParity.test.ts` (`FSL` interface + fixtures), `funnelSettings.contract.test.ts` (`coercePaid` request shape + `FIELD_MAP` + FunnelSettingsDoc fixture). |
| Frontend tests | `funnelCompleteness.test.ts` (fixtures + assertion keys), `funnelSettingsRender.test.tsx` (`makeSettingsDoc` factory). |
| `scripts/patch-paid-product-fields.mjs` | **Deleted.** The migration is complete; the script would re-apply against an already-migrated state if it stayed in the repo. |

**Verification.**

| Suite | Tests | Pass | |
 |---|---|---|---|
| `vitest` (frontend) | 81 | 81 | All 16 funnelSettingsRender assertions pass; the new `product*` keys appear on paid_product only; the `lead_magnet_call` branch keeps its unprefixed chain slots. |
| `npm run test:phase14` (backend) | 14 suites | 14 / 0 | All contract + parity + cpaEconomics tests pass; the new `product*` keys appear on paid_product only; lead_magnet_call tests are unchanged. |
| SC-11 guard | 85 files scanned | pass | 11 PERCENT_SIGN suppressions (the benchmark hints — `product*` adds 3 to the previous 8; the count went 8 → 11 across the paid_product + lead_magnet_call hint pairs). |

The bug is closed. The regression test (`funnelSettingsRender.test.tsx`)
guards against re-introducing the wrong field set on paid_product.
The storage overload is closed: the `event*` / `product*` / lead-side
unprefixed convention is now the codebase's storage pattern for
funnel-scoped chain fields.

---

## 12. Phase 13 — paid_product benchmark copy

### What Phase 11 / Phase 12 actually shipped

Phase 11 reused the lead_magnet_call chain slots for paid_product
(same field name, different denominator). Phase 12 renamed the storage
slots to `product*` to keep the buyer-side rates distinct from the
lead-side rates — but the **form copy** (the hints under each input)
tracked the storage-slot identity rather than the funnel-type identity.
The Phase 12 test sweep (`funnelSettingsRender.test.tsx`) checks which
labels render but not what those labels say, so the lead-side hint
copy moved over with the rename:

| Field | EN hint (shipped) | AR hint (shipped) |
|---|---|---|
| `productBookingRate` | `"Buyers who book a call — Typical range: 5–10%"` | `"نسبة المشترين الذين يحجزون مكالمة — المعتاد: 5 – 10%"` |
| `productShowUpRate` | `"Booked calls that happen — Typical range: above 65%"` | `"المحجوزة التي تحدث — المعتاد: أكثر من ٦٥٪"` |
| `productCloseRate` | `"Attended calls that buy — Typical range: 20–25%"` | `"الحضور الذين يشترون — المعتاد: 20 – 25%"` |

The benchmarks 5–10 / 65+ / 20–25 are the `uiCopy.md` #2 / #4 / #6
numbers — the **lead_magnet_call** benchmarks. A buyer-side booking
rate of 20% versus a lead-side 5–10% is exactly the cross-funnel
confusion the `product*` rename was meant to prevent. Phase 12 closed
the storage half but left the copy half intact.

The copy followed the storage slots — every Phase 11 hint on
paid_product was a verbatim copy of the corresponding `lead_magnet_call`
hint. Phase 12 did not touch the form copy because the test sweep did
not assert on hint content.

### Product owner confirmed paid_product benchmarks

| Field | EN hint | AR hint |
|---|---|---|
| `productBookingRate` | `Typical range: 20%` | `المعتاد: ٢٠٪` |
| `productShowUpRate` | `Typical range: 60%` | `المعتاد: ٦٠٪` |
| `productCloseRate` | `Typical range: 10%` | `المعتاد: ١٠٪` |

The 10% figure on `productCloseRate` is the close rate on **qualified**
attended calls — buyer attended + buyer is qualified to buy. That
qualifier is not in the hint copy itself; it belongs on the LABEL.
The current label (`High ticket close rate (%)`) is ambiguous — it
describes all attended calls, not the qualified subset.

### Status of `productCloseRate` label wording (awaiting approval)

Current label:

```tsx
label={L('High ticket close rate (%)', 'نسبة إغلاق العرض عالي القيمة من الحضور (%)')}
```

The current wording does **not** convey that the rate applies to
qualified attended calls. Per the owner's gate: propose new wording
and wait for approval — do not reword unilaterally.

Proposed label (pending sign-off):

- EN: `"Close rate on qualified attended calls (%)"` /
  `"High ticket close rate on qualified calls (%)"`
- AR: `"نسبة الإغلاق على المكالمات المؤهلة التي حضرت (%)"` /
  `"نسبة إغلاق الصفقة من العملاء المؤهلين الذين حضروا (%)"`

The qualifier lives on the LABEL because the chain's three stages are
all qualifications: `productBookingRate` (% of buyers who book — i.e.
buyers, not leads), `productShowUpRate` (% of booked who show — i.e.
booked, not all buyers), `productCloseRate` (% of attended who buy —
i.e. attended **and qualified to buy**, not all attended). The English
language doesn't naturally distinguish "attended" from "qualified
attended" in a single word — that's why the qualifier must be
explicit.

The form has NOT been reworded yet. The hint `Typical range: 10%` /
`المعتاد: ١٠٪` is added to the contract (`#31`) but not to the form
text until the label wording lands.

### Implementation so far

- `productBookingRate` hint: `Typical range: 20%` / `المعتاد: ٢٠٪` — applied
- `productShowUpRate` hint: `Typical range: 60%` / `المعتاد: ٦٠٪` — applied
- `productCloseRate` hint: lead-side copy still on the form (line 1349)
  — awaiting label approval
- `contracts/uiCopy.md`: three new pairs added (`#29`, `#30`, `#31`)
  in a "Low price offer" section; suppression count 8 → 11; total pairs
 30 → 33; verification step updated.

The bug closed in Phase 12 stays closed — the storage-slot overload
was the load-bearing fix. The Phase 13 work is a copy correction
that surfaced because the product owner reviewed the benchmarks
and noticed the lead-side numbers had leaked onto the buyer-side
fields.

— Phase 11 (production-bug batch)

---

## 13. Phase 13 — qualification stage + mouse-wheel guard

### Qualification stage (CHANGE 1)

Both call-based funnel types (`lead_magnet_call` and `paid_product`)
were missing one stage of their sales-call chain. Some booked calls
that happen turn out to be unqualified; folding that drop-off into
the close rate conflated two different rates (close rate measures
qualified attended calls that buy; qualification rate measures
attended calls that turn out to be qualified). Phase 13 added the
qualification stage to both chains:

```
lead_magnet_call:  booking → show-up → qualification → close
paid_product:      productBooking → productShowUp
                    → productQualification → productClose
```

`paid_event` and `free_webinar` are unaffected — neither has a
sales-call chain.

The product owner supplied the benchmarks (`7.5 / 60 / 50 / 25` for
lead-side, `20 / 60 / 50 / 25` for buyer-side). The headline anchor
at margin 60 (the form's default) moves from $12.76 → $6.08 on
lead_magnet_call and from $94.00 (chain product 0.05) → $56.20
(chain product 0.015) on paid_product.

### Mouse-wheel guard (CHANGE 2)

The browser's default behavior for a focused `<input type="number">`
is to increment or decrement the value when the user scrolls. On the
funnel form, this let a coach silently alter their targets by
scrolling the page. The fix installs an `onWheel` handler on every
number input via the shared `NumberField` component. The handler is
exported as `preventWheelValueChange` (so the integration test can
pin the wiring without re-deriving it from JSX) and guards with a
`target === currentTarget` check so a wheel event that bubbled UP
from a child element is not suppressed — only direct wheel on the
focused input is blocked.

The codebase has exactly **one** `<input type="number">` site
(`FunnelSettingsForm.tsx:1629`, inside `NumberField`); fixing the
component fixes every number input globally. No other call sites
to track.

### Storage

| Field | Funnel | Type | Notes |
|---|---|---|---|
| `qualificationRate` | `lead_magnet_call` | `number \| null` on doc, `number` on inputs | unprefixed (matches `bookingRate` / `showUpRate` / `leadToCloseRate` siblings) |
| `productQualificationRate` | `paid_product` | `number \| null` on doc, `number` on inputs | `product*` prefix (matches `productBookingRate` / `productShowUpRate` / `productCloseRate`) |

Both scoped to `null` on every other funnel type. Both required when
their funnel type is in use (matches existing completeness rule
shape).

### Formula

```
lead_magnet_call:
  leadValue = offerPrice × netFactor
              × (bookingRate/100)
              × (showUpRate/100)
              × (qualificationRate/100)
              × (leadToCloseRate/100)
  economicCeilingCpl = leadValue × spendShare

paid_product:
  fullBuyerValue = aov + htoPrice × netFactor
                    × (productBookingRate/100)
                    × (productShowUpRate/100)
                    × (productQualificationRate/100)
                    × (productCloseRate/100)
  maxCpa = fullBuyerValue × spendShare
  effectiveTargetCpa = min(rawTargetCpa, maxCpa)
```

### Labels

| Field | EN | AR |
|---|---|---|
| qualificationRate | Qualification rate (%) | نسبة المكالمات المؤهلة (%) |
| productQualificationRate | Qualification rate (%) | نسبة المكالمات المؤهلة (%) |
| leadToCloseRate (revised) | Close rate on qualified calls (%) | نسبة الإغلاق في المكالمات المؤهلة (%) |
| productCloseRate (revised) | Close rate on qualified calls (%) | نسبة الإغلاق في المكالمات المؤهلة (%) |

The qualifier ("qualified") lives on the LABEL because the close
rate's 25% benchmark applies to QUALIFIED attended calls, not all
attended calls. The labels carry the qualifier explicitly. Hints
land as `Typical range: 50%` / `المعتاد: ٥٠٪` (qualification) and
`Typical range: 25%` / `المعتاد: ٢٥٪` (close on qualified calls).

### Implementation

**Backend (`functions/src/cpaEconomics.ts`):**
- `LeadMagnetCallInputs` gains `qualificationRate: number`.
- `PaidFunnelInputs` gains `productQualificationRate: number`.
- `deriveTargetCplLeadMagnetCall` multiplies the 4-stage chain.
- `deriveTargetCpa` paid_product branch multiplies the 4-stage chain.
- `assertLeadMagnetCallInput` validates the percentage range on `qualificationRate`.
- `assertPaidInput` validates the percentage range on `productQualificationRate`.

**Backend doc shape (`functions/src/funnelSettings.ts`):**
- `FunnelSettingsDoc` gains `qualificationRate: number \| null` (lead_magnet_call only) and `productQualificationRate: number \| null` (paid_product only).
- `FunnelSettingsLike` mirrors both for the completeness predicate.
- `assertRequiredFieldPresent` includes both fields in their respective branches.
- `requiredFieldsForDoc` includes both for completeness.
- `buildFunnelInputs` reads both from the request (defaults to `0`).
- `SaveFunnelSettingsRequest` carries both.
- Doc construction persists both, scoped `null` outside their funnel type.

**Frontend (`src/components/FunnelSettingsForm.tsx`):**
- `FunnelSettingsDoc`, `ComputeMissingFieldsInput`, `MISSING_FIELD_LABELS`, `SaveFunnelSettingsRequest`, optimistic-merge, form state, hydration, `handleSave` all carry the new fields.
- `DerivedTargets` gains `economicsVersion: number` (the test fixture was already stamping it; the type was missing — fixed for type correctness).
- JSX lead_magnet_call branch: insert `Qualification rate (%)` between show-up and close; close label updated to `Close rate on qualified calls (%)`; show-up hint updated to `Typical range: 60%`; close hint updated to `Typical range: 25%`.
- JSX paid_product branch: insert `Qualification rate (%)` between attendance and close; close label updated to `Close rate on qualified calls (%)`; close hint updated to `Typical range: 25%`.

**Mouse-wheel guard:**
- `preventWheelValueChange` exported from `FunnelSettingsForm.tsx` (pure, takes the event shape).
- Wired onto `<input type="number">` in `NumberField` as `onWheel={preventWheelValueChange}`.

### Tests

- **`functions/src/__tests__/cpaEconomics.test.ts`** (66 tests): every fixture that touches the chain updated. The OQ-1 paid_product anchor (`fullBuyerValue = 235`) becomes `140.50` with the Phase 13 benchmarks. The second-discriminator fixture (`7.5/70/22.5 → 7.5/60/50/25`) preserves the non-round property. The lead_magnet_call §6.1 fixture (`$12.76 default` → `$6.08 default`). T026 margin-scaling tests: paid_product ×1.25 / ×0.75 holds cleanly (chain product 0.015 round); lead_magnet_call 60→70 holds cleanly (6.08 × 0.75 = 4.56); lead_magnet_call 60→50 lands at 7.59 ≠ 6.08 × 1.25 = 7.60 — the rounding breaks the rounded-output equality, so the test asserts on unrounded intermediates (the structural identity still holds). T021 regression anchor updates (`assert.equal(target, 12.76)` → `6.08`). **T070 rounding-order fixture restored to a discriminating case** (post-batch follow-up): re-searched the 4-stage input space (`booking 5–10% × showUp 55–70% × qualification 40–60% × close 20–25%`, offerPrice 1–3000; 1.98M combinations) and chose `offerPrice=2000, rates=5/65/50/25` — `targetEnd=2.93, targetInt=2.92` (the same shape as the original 3-stage fixture's 2.93/2.92 disagreement). The test now serves its original purpose: asserting end-of-chain rounding with a positive case that intermediate rounding would fail.
- **`functions/src/__tests__/funnelSettings.contract.test.ts`** (33 tests): `coercePaid` and `coerceLeadMagnetCall` carry the new fields. `FIELD_MAP` includes them. The completeness-with-chain test updates. The multiple-missing-fields test grows to 6 (was 5).
- **`functions/src/__tests__/funnelEconomicsParity.test.ts`** (15 tests): FSL interface + fixture default + missing-chain assertions.
- **`src/__tests__/funnelCompleteness.test.ts`**: every fixture updated; `MISSING_FIELD_LABELS` table carries both new entries; `internalKeys` list adds both.
- **`src/__tests__/funnelSettingsRender.test.tsx`** (16 + 3 NEW = 19 tests): makeSettingsDoc updated; POSITIVE assertions for lead_magnet_call + paid_product include the new `Qualification rate (%)` label and the revised close label; NEGATIVE assertions assert the OLD close labels are absent on every funnel type. **CHANGE 2** added 3 tests:
  - `preventWheelValueChange calls preventDefault when wheel target is the focused input` — positive case.
  - `preventWheelValueChange does NOT call preventDefault when target !== currentTarget` — bubble case (child element).
  - `mount: wheel over a focused number input does not change its value (integration)` — verifies the handler is wired up on the real DOM the form renders.

### Contracts

**`specs/968-funnel-economics-rebuild/contracts/cpaEconomics.md`:**
- §3 formulas updated (both chains include `qualification` term).
- §4.1 lead_magnet_call fixture: chain `7.5/70/22.5 → 7.5/60/50/25`; leadValue `31.89 → 15.19`; targets `15.95/12.76/9.57 → 7.59/6.08/4.56`.
- §4.4 paid_product OQ-1: chain `htoConversionRate=5 → 20/60/50/25`; fullBuyerValue `235 → 140.50`; maxCpa `94 → 56.20`; effective `94 → 56.20`. Discriminator table updated (211.50 → 130.50; 250.00 → 145.00).
- §4.4a added: paid_product second-discriminator fixture (7.5/60/50/25 → fullBuyerValue 115.19; non-round product 0.005625 preserves the structural-discriminator property).

**`specs/968-funnel-economics-rebuild/contracts/uiCopy.md`:**
- Count headers: 11 → 13 suppressions (24 → 22 clean pairs); total 33 → 35 pairs.
- §2 placement rules + §5 verification step updated.
- Lead magnet → call section: #4 hint swapped (`above 65%` → `60%`); #5 label + #6 hint swapped (`Close rate on calls that happened (%)` / `Typical range: 20–25%` → `Close rate on qualified calls (%)` / `Typical range: 25%`).
- Low price offer section: #31 hint swapped (`Typical range: 10%` → `Typical range: 25%`); note added explaining the qualifier-on-label rationale.
- New "Qualification stage (Phase 13)" section added with #32 (lead_magnet_call) and #33 (paid_product) hint pairs.
- New "Mouse-wheel guard (Phase 13 CHANGE 2)" section added documenting `preventWheelValueChange` and the integration test.

### Test results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `vitest` (frontend) | 84 | 84 | 0 |
| `npm run test:phase14` (backend) | 14 suites, 307 tests | 307 | 0 |
| SC-11 terminology guard | 85 files | pass | 0 forbidden terms |

The 1228 lint errors are pre-existing issues in `functions/lib/` build
artifacts (eslint config mismatch on the compiled output) — none of
my changed files (`functions/src/`, `src/components/`, `src/__tests__/`,
`specs/`, `docs/`) report lint errors.

The Phase 12 bug stays closed: the storage-slot overload
(product* prefix on paid_product, qualification* on the lead side)
remains in place and the Phase 13 work extends the chain by one
stage rather than rearranging the existing storage. The headline
fixture changes are all in the same direction — the new chain is
strictly more conservative than the old (qualifying booked calls
before measuring close rate can only reduce the headline target),
which matches the owner's intent on both funnel types.

### Risks / follow-ups

- The 60→50 T026 scaling test had to be rewritten to assert on
  unrounded intermediates — the previous assertion (rounded outputs
  agree to the cent) was accidental, not load-bearing. A future
  reader might re-introduce the rounded-output assertion expecting
  it to work; the test's docstring explicitly notes that the
  × 1.25 identity holds on unrounded values, with the cent drift
  observed at this chain length.
- The qualification rate is a benchmark owner-supplied; if real-
  world data drives it materially lower than 50%, the headline
  target drops further. Phase 14 should consider a sensitivity
  check or two-axis hint (`30–70%` range with the 50% center) if
  the cohort distribution warrants it. Out of scope for Phase 13.