# Phase 1 Data Model: HOTFIX-H — Final Pricing & Naming Alignment

**Date**: 2026-05-06
**Branch**: `022-hotfix-h-pricing-naming-alignment`

> This hotfix introduces no new entities, modifies no Firestore schema, and changes no API payload shape. The "data model" here is the set of in-code constants whose literal values the hotfix updates, plus the consumers (read paths) of each. Documenting them is what `data-model.md` is for in a code-only alignment hotfix.

## In-Code Constants Touched

### Constant 1 — `PLANS.starter` (in `src/planconfig.ts`, line 171)

The Starter plan record inside the exported `PLANS: Record<UserPlan, PlanFeatures>` object.

**Shape** (excerpt — only fields relevant to this hotfix):

| Field | Type | Pre-hotfix value | Post-hotfix value | Why |
|---|---|---|---|---|
| `priceMonthly` | `number` | `19` | `29` | HFH.1 — match GHL checkout. |
| `priceAnnualPerMonth` | `number` | `15.20` | `23.20` | HFH.1 — match the documented 20%-savings annual price ($29 × 0.80 = $23.20). |
| (every other field) | (various) | (unchanged) | (unchanged) | HFH.1 explicitly forbids touching credits, limits, features, etc. |

**Read paths** (where this value reaches the user): every component that imports `PLANS` and renders Starter pricing — including but not limited to billing screens, plan-selection modals, upgrade prompts, and any helper that derives display strings from `PLANS.starter.priceMonthly` / `.priceAnnualPerMonth`. The hotfix does not change any of these consumers; they automatically pick up the new values.

### Constant 2 — Feature-label literal `'Creative Scoring Engine'` (in `src/planconfig.ts`, line 140)

The user-facing display string in a feature-label array (specifically `buildFeatureLabels()` at line 140 in the current file). The boolean entitlement key `creativeScoringEngine` (at lines 87, 164, 176, 189, 202, 270) is a separate identifier and remains unchanged.

| Field | Type | Pre-hotfix value | Post-hotfix value | Why |
|---|---|---|---|---|
| `label` literal | `string` | `'Creative Scoring Engine'` | `'Predictive CTR Engine'` | HFH.2 — user-visible rename. |
| `key` literal (same record) | `string` | `'creativeScoringEngine'` | `'creativeScoringEngine'` | HFH.2 explicitly forbids touching the identifier. |

**Read paths**: every billing/entitlement UI that calls `buildFeatureLabels(features)` to render plan-feature lists. The string is already locale-flat (English-only), so no i18n bundle needs updating in this hotfix.

### Constant 3 — `plans` array (in `src/components/PricingTable.tsx`, lines 22–26)

The 3-entry array driving the column headers of the rendered pricing table. Only the first (Starter) entry is touched.

**Shape (Starter entry only):**

| Field | Type | Pre-hotfix value | Post-hotfix value | Why |
|---|---|---|---|---|
| `monthly` | `number` | `19` | `29` | HFH.3 — match `PLANS.starter.priceMonthly`. |
| `annual` | `number` | `15.20` | `23.20` | HFH.3 — match `PLANS.starter.priceAnnualPerMonth`. |
| (every other field on Starter) | (various) | (unchanged) | (unchanged) | HFH.3 only changes monetary values. |

**Read paths**: rendered as the Starter column header in the pricing table (`<PricingTable />` component).

### Constant 4 — `featureRows` array (in `src/components/PricingTable.tsx`, lines 33–69)

The ordered array driving rows of the pricing table. Five rows are touched. Two of those (Multi-Brand Workspaces, Offer Creative Modes) change a single literal; one (Creative Scoring Engine → Predictive CTR Engine) renames a label; one (Batch Rendering) changes a `section` value AND moves the row's physical position; and `Multi-Brand Workspaces` removes a property from one cell value object.

**Per-row delta:**

| Row label (pre) | Pre-hotfix state | Post-hotfix state | HFH ref |
|---|---|---|---|
| `'Offer Creative Modes'` (line 46) | `values: ['All 18+', 'All 18+', 'All 18+']` | `values: ['6', 'All 21', 'All 21']` | HFH.4 |
| `'Carousel Ads'` (line 58) | (unchanged) | (unchanged) | — (reference point for HFH.5 destination) |
| `'Batch Rendering'` (line 63) | `{ section: 'scale', label: 'Batch Rendering', note: '...', values: [false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }] }` at array position 30 (under Scale Exclusives) | Same shape, but `section: 'studio'` and physically moved to immediately after the `'Carousel Ads'` row (i.e., into the Render Studio section, between Carousel Ads and the next non-studio row). Values unchanged. | HFH.5 |
| `'Creative Scoring Engine'` (line 64) | `{ section: 'scale', label: 'Creative Scoring Engine', note: 'AI ranks your creatives by predicted CTR', values: [false, false, { text: '✓ Scale only', emphasis: true }] }` | Same shape, label changed to `'Predictive CTR Engine'`. `note`, `section`, and `values` unchanged. | HFH.6 |
| `'Multi-Brand Workspaces'` (line 67) | Third (Scale) value object: `{ text: '✓ Scale only', emphasis: true, soon: true }` | Third value object: `{ text: '✓ Scale only', emphasis: true }` (the `soon: true` property removed). First (Starter) and second (Pro) values unchanged. | HFH.7 |

**Read paths**: every row is rendered as a `<tr>` inside the `<table>` body of `<PricingTable />`. The `section` field controls grouping into named sections (Render Studio, Scale Exclusives, etc.); changing `'Batch Rendering'.section` from `'scale'` to `'studio'` is what reassigns the row to the Render Studio group at render time.

## In-Code Constants Explicitly NOT Touched

These are listed because they sit adjacent to the touched constants and the spec specifically forbids touching them. Listing them here is part of the gate against accidental scope creep.

| Constant / file | Reason it stays |
|---|---|
| `creativeScoringEngine` boolean field name (`src/planconfig.ts`, lines 87, 164, 176, 189, 202, 270; also `src/entitlements.ts`, `src/hooks/useBillingState.ts`) | HFH closing block: "internal field name… separate, larger refactor". |
| File `functions/src/creativeScoringEngine.ts` | HFH closing block: "internal name, never user-visible". |
| `PLANS.pro` (`src/planconfig.ts:183`) and `PLANS.scale` (`src/planconfig.ts:196`) | Pro and Scale prices already correct ($79 / $63.20 and $179 / $143.20). |
| `plans[1]` (Pro, `src/components/PricingTable.tsx:24`) and `plans[2]` (Scale, `src/components/PricingTable.tsx:25`) | Same reason as above for the rendered table. |
| Every Starter field other than `priceMonthly` and `priceAnnualPerMonth` (credits, limits, feature flags) | HFH.1 explicitly: "Do NOT touch any other field on the Starter plan." |
| All other rows in `featureRows` not listed in the touched table above | HFH only modifies the five rows enumerated. |
| Marketing site at `proadsai.com` (GHL) | Out of Scope — handled via GHL admin console. |
| Stripe price IDs | Out of Scope — created in Phase 21. |

## Migration / Backfill

**None.** No Firestore schema migration. No data backfill. No `paddle_events` / `users/{uid}.billingState` rewrite. Existing user billing records continue to reference their plan by `id` (`'starter' | 'pro' | 'scale' | 'none'`); the new prices are automatically applied because every consumer reads from `PLANS` (single source of truth in code).

## Validation Rules Affected

**None.** No validation rule changes. The hotfix does not touch:

- `validateModeFormatCombination` (creativeResolver.ts)
- `enforceModeFormatGate` (functions/src/index.ts)
- Any Zustand selector or React-form validator
- Any Firestore security rule

The change is purely in displayed numbers and displayed labels.
