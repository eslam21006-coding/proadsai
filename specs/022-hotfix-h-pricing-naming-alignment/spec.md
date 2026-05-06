# Feature Specification: HOTFIX-H — Final Pricing & Naming Alignment

**Feature Branch**: `022-hotfix-h-pricing-naming-alignment`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "HOTFIX-H — Final Pricing & Naming Alignment. Read HOTFIX-H from docs/LAUNCH_MATRIX.md (the section between HOTFIX-G and Phase 20, 8 atomic tasks HFH.1–HFH.8). The spec must be a faithful, self-contained restatement of those 8 tasks — no new features, no scope creep."

## Context

A prior documentation-alignment pass (on the `021-stripe-migration` branch) corrected every spec/doc reference to the final Pro Ads AI pricing — Starter $29 / Pro $79 / Scale $179 monthly, with a 20% annual savings — and renamed the user-facing label "Creative Scoring Engine" → "Predictive CTR Engine". That pass deliberately left three live code files untouched, per its "no code changes outside docs/specs" rule. As a result, three user-visible surfaces in the running app still show the old, pre-alignment numbers and labels:

- `src/planconfig.ts` still encodes Starter at `priceMonthly: 19` / `priceAnnualPerMonth: 15.20` and still includes a feature label `'Creative Scoring Engine'`.
- `src/components/PricingTable.tsx` still renders the Starter column with the old prices, still labels the Scale Exclusives row "Creative Scoring Engine", places "Batch Rendering" under Scale Exclusives instead of Render Studio, claims `'All 18+'` Offer Creative Modes for every plan, and still shows a `Soon` badge on Multi-Brand Workspaces (which has been live since Phase 12).

This hotfix closes that gap so that the live app, the in-app pricing table, and the public docs all agree before launch. It is purely a marketing/UI alignment — no feature flags change, no entitlement logic moves, no internal symbol is renamed.

**Why pre-launch (and not deferred):** Pricing on `app.proadsai.com` must match what GoHighLevel charges at checkout. A user paying $29 on GHL but seeing `$19/mo` on the in-app pricing table creates a refund risk and a trust break.

**Scope boundary:** The internal TypeScript field name `creativeScoringEngine` (a boolean entitlement key) and the file `functions/src/creativeScoringEngine.ts` are intentionally NOT renamed. Only user-visible strings change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Starter Pricing Accuracy (Priority: P1)

A prospective customer on the in-app pricing table sees the same Starter price the checkout (GHL) will charge: $29/month on the monthly toggle, $23.20/month on the annual toggle. The same numbers are exposed everywhere `planconfig.ts` is consumed in the app (plan selectors, billing screens, upgrade prompts).

**Why this priority**: Pricing mismatch between the app and the checkout creates immediate refund risk and erodes trust. Without this story, the launch is blocked.

**Independent Test**: Open the in-app pricing table with the monthly toggle and confirm Starter shows `$29/mo`. Toggle to annual and confirm Starter shows `$23.20/mo`. Confirm Pro ($79 / $63.20) and Scale ($179 / $143.20) values are unchanged from before the hotfix.

**Acceptance Scenarios**:

1. **Given** a user on the pricing table with the monthly toggle selected, **When** the page renders, **Then** the Starter column header shows `$29/mo` and the Pro and Scale columns are unchanged.
2. **Given** a user toggles to the annual view, **When** the page re-renders, **Then** the Starter column shows `$23.20/mo` and the Pro and Scale annual values are unchanged.
3. **Given** any other surface that consumes `PLANS.starter` (plan selector, billing screen, upgrade prompt), **When** it renders the Starter price, **Then** it shows the same $29 / $23.20 numbers — no surface keeps the old $19 / $15.20 values.

---

### User Story 2 — Label & Layout Naming Consistency (Priority: P1)

A prospective customer reading the in-app pricing table sees the same names and the same row layout the public marketing copy uses:

- The Scale Exclusives row formerly labeled "Creative Scoring Engine" now reads "Predictive CTR Engine".
- "Batch Rendering" appears inside the Render Studio section, immediately after "Carousel Ads" — not inside Scale Exclusives.
- The "Offer Creative Modes" row reflects the actual `maxOfferModes` entitlement: `6 / All 21 / All 21` — not the old uniform `'All 18+'` claim.
- The "Multi-Brand Workspaces" Scale cell no longer carries a `Soon` badge, because the feature is live (Phase 12 shipped).

**Why this priority**: A pricing table that misnames or misplaces features at the moment of purchase causes the same trust break as wrong prices. P1 alongside Story 1.

**Independent Test**: Render the pricing table and inspect, in order: (a) the Scale Exclusives section header for the renamed row, (b) the Render Studio section for Batch Rendering's new position, (c) the Offer Creative Modes row values, (d) the Multi-Brand Workspaces row's Scale cell for absence of the Soon badge.

**Acceptance Scenarios**:

1. **Given** the pricing table is rendered, **When** the Scale Exclusives section is inspected, **Then** the row label reads "Predictive CTR Engine" and the string "Creative Scoring Engine" appears nowhere on the page.
2. **Given** the pricing table is rendered, **When** the Render Studio section is inspected, **Then** Batch Rendering appears as a row in that section, positioned immediately after Carousel Ads, with values `[—, Up to 4 ads / run, Up to 36 ads / run]` (the Scale value emphasized).
3. **Given** the pricing table is rendered, **When** the Scale Exclusives section is re-inspected, **Then** Batch Rendering is no longer listed there.
4. **Given** the pricing table is rendered, **When** the Offer Creative Modes row is inspected, **Then** its three columns show `6 / All 21 / All 21`.
5. **Given** the pricing table is rendered, **When** the Multi-Brand Workspaces row's Scale cell is inspected, **Then** no "Soon" badge is rendered.
6. **Given** any user-facing copy in `planconfig.ts` (e.g. `buildFeatureLabels()` or any feature-label array), **When** it is rendered, **Then** "Creative Scoring Engine" appears nowhere and "Predictive CTR Engine" appears in its place. The internal field name `creativeScoringEngine` is still present in the code (unchanged).

---

### User Story 3 — Build & Verification (Priority: P1)

An engineer applying the hotfix can confirm — without running the app — that the alignment is complete and that no stale strings or numbers were left behind in user-facing code paths. The standard build commands all pass, and a small set of grep checks return zero matches in shipped code (test fixtures and historical test files are exempt).

**Why this priority**: Without this gate, the hotfix can ship with a stale string the eye missed (e.g. `15.20` in a copy block, `$197` in a tooltip). The grep+build check is the launch criterion.

**Independent Test**: From the project root, run `npm run lint && npm run typecheck && npm run build`; then `cd functions && npm run lint && npm run typecheck && npm run build`. Then grep `src/` and `functions/src/` (excluding `**/__tests__/**` and `**/*.test.ts`) for the five strings listed in HFH.8.

**Acceptance Scenarios**:

1. **Given** the seven code edits (HFH.1 through HFH.7) have been applied, **When** `npm run lint && npm run typecheck && npm run build` is run from the project root, **Then** all three commands exit successfully.
2. **Given** the same edits, **When** the same three commands are run from `functions/`, **Then** all three exit successfully.
3. **Given** the codebase after the edits, **When** `src/` and `functions/src/` are grepped (excluding `**/__tests__/**` and `**/*.test.ts`) for each of `"$197"`, `"15.20"`, `"$19/mo"`, `"Creative Scoring Engine"`, `"2 months free"`, **Then** every grep returns zero matches.

---

### Edge Cases

- **`creativeScoringEngine` field name preservation**: The boolean entitlement key `creativeScoringEngine` (in `planconfig.ts`, `entitlements.ts`, `useBillingState.ts`) and the file `functions/src/creativeScoringEngine.ts` MUST remain after the hotfix. Only the user-visible string is renamed. A grep for `creativeScoringEngine` (the identifier, lowercase first letter, no space) must still return matches; a grep for `Creative Scoring Engine` (the user-facing label, capitalized with spaces) must return zero matches in shipped user-facing paths.
- **Test-fixture historical references**: Test files under `**/__tests__/**` and files matching `**/*.test.ts` are explicitly exempt from the grep checks. They may legitimately contain historical strings such as `"$19/mo"` to verify migration logic.
- **Pro and Scale prices**: Pro ($79 / $63.20) and Scale ($179 / $143.20) are already correct in `planconfig.ts`. The hotfix MUST NOT touch them.
- **Starter non-price fields**: The Starter plan object in `planconfig.ts` has many fields beyond the two prices (credits, limits, features). Only `priceMonthly` and `priceAnnualPerMonth` change. Every other Starter field stays exactly as-is.
- **Multi-Brand Workspaces — only the Scale cell**: The `soon: true` property is removed only from the Scale (third) cell of the Multi-Brand Workspaces row. The Starter and Pro cells in that row are untouched.
- **Out-of-app surfaces**: The marketing site at `proadsai.com` (hosted on GHL) and Stripe price IDs are explicitly out of scope (see Out of Scope below).

## Requirements *(mandatory)*

### Functional Requirements

The eight tasks below are an exact, faithful restatement of HFH.1 through HFH.8 in `docs/LAUNCH_MATRIX.md`. Each requirement maps 1:1 to one HFH row and uses the same Done-when criterion.

- **FR-001 (HFH.1 — Starter price in `src/planconfig.ts`)**: In the `starter` plan object, the field `priceMonthly` MUST be `29` and the field `priceAnnualPerMonth` MUST be `23.20`. The Pro and Scale plan objects MUST be unchanged. No other field on the Starter plan (credits, limits, features) changes.

- **FR-002 (HFH.2 — Label rename in `src/planconfig.ts`)**: The user-facing string `'Creative Scoring Engine'` (wherever it appears in `planconfig.ts` — for example in `buildFeatureLabels()` or any feature-label array) MUST be replaced with `'Predictive CTR Engine'`. The boolean field name `creativeScoringEngine` MUST NOT be renamed, and no reference to the file `creativeScoringEngine.ts` MUST be touched.

- **FR-003 (HFH.3 — Starter price in `src/components/PricingTable.tsx`)**: In the `plans` array, the Starter entry MUST have `monthly: 29` and `annual: 23.20`. The Pro and Scale entries MUST be unchanged.

- **FR-004 (HFH.4 — Offer Creative Modes row values)**: In the `featureRows` array of `src/components/PricingTable.tsx`, the row labeled `'Offer Creative Modes'` MUST have `values: ['6', 'All 21', 'All 21']` (replacing the prior `['All 18+', 'All 18+', 'All 18+']`). The values match the actual `maxOfferModes` entitlements from `planconfig.ts` (Starter 6, Pro/Scale 21).

- **FR-005 (HFH.5 — Move "Batch Rendering" to Render Studio)**: In the `featureRows` array of `src/components/PricingTable.tsx`, the row labeled `'Batch Rendering'` MUST have its `section` value changed from `'scale'` to `'studio'`, AND the row MUST be physically moved so that it appears immediately after the `'Carousel Ads'` row inside the Render Studio section. The row's `values` array MUST remain `[false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }]`.

- **FR-006 (HFH.6 — Rename "Creative Scoring Engine" row in PricingTable)**: In the `featureRows` array of `src/components/PricingTable.tsx`, the row labeled `'Creative Scoring Engine'` MUST be renamed to `'Predictive CTR Engine'`. The row's `note`, `section`, and `values` fields MUST be unchanged.

- **FR-007 (HFH.7 — Remove `Soon` badge from Multi-Brand Workspaces / Scale cell)**: In the `featureRows` array of `src/components/PricingTable.tsx`, in the row labeled `'Multi-Brand Workspaces'`, the third (Scale) value object MUST have its `soon: true` property removed. (Multi-Brand Workspaces is live — Phase 12 shipped per Section 0.5 of the Launch Matrix.)

- **FR-008 (HFH.8 — Verification)**: After applying FR-001 through FR-007, all of the following MUST hold:
  1. Running `npm run lint && npm run typecheck && npm run build` from the project root completes successfully.
  2. Running `npm run lint && npm run typecheck && npm run build` from `functions/` completes successfully.
  3. Greps across `src/` and `functions/src/` — excluding `**/__tests__/**` and `**/*.test.ts` — for each of the strings `"$197"`, `"15.20"`, `"$19/mo"`, `"Creative Scoring Engine"`, and `"2 months free"` MUST each return zero matches.

### Key Entities *(include if feature involves data)*

- **`PLANS.starter` (in `src/planconfig.ts`)**: The Starter plan record. Only its `priceMonthly` and `priceAnnualPerMonth` fields change in this hotfix. Every other field is untouched.
- **`featureRows` (in `src/components/PricingTable.tsx`)**: The ordered array driving rendered rows of the pricing table. Five rows are touched: Offer Creative Modes (values), Batch Rendering (section + position), Creative Scoring Engine → Predictive CTR Engine (label), Multi-Brand Workspaces (Scale cell loses `soon: true`), plus any user-facing label string in `planconfig.ts`'s feature-label arrays.
- **`plans` (in `src/components/PricingTable.tsx`)**: The 3-entry array driving the column headers of the pricing table. Only the Starter entry's `monthly` and `annual` numeric fields change.
- **Internal symbol `creativeScoringEngine`**: The boolean entitlement key on plan/user records. Explicitly preserved by this hotfix; renaming it is a separate, larger refactor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Each criterion below maps directly to one HFH.N row's Done-when condition.

- **SC-001 (maps to HFH.1)**: After the hotfix, `PLANS.starter.priceMonthly === 29` and `PLANS.starter.priceAnnualPerMonth === 23.20` are both true. Pro and Scale prices are unchanged.

- **SC-002 (maps to HFH.2)**: A grep for `Creative Scoring Engine` against `src/planconfig.ts` returns zero matches. A grep for `Predictive CTR Engine` against `src/planconfig.ts` returns at least one match. The identifier `creativeScoringEngine` (lowercase, no spaces) still exists in the file.

- **SC-003 (maps to HFH.3)**: When the pricing table is rendered with the monthly toggle, the Starter column header shows `$29/mo`; with the annual toggle, it shows `$23.20/mo`.

- **SC-004 (maps to HFH.4)**: The "Offer Creative Modes" row in the rendered pricing table shows the three column values `6 / All 21 / All 21` (Starter / Pro / Scale).

- **SC-005 (maps to HFH.5)**: The "Batch Rendering" row renders inside the Render Studio section, positioned between "Carousel Ads" and the next section; the Scale Exclusives section no longer contains "Batch Rendering".

- **SC-006 (maps to HFH.6)**: The Scale Exclusives section header text reads "Predictive CTR Engine"; a grep for `Creative Scoring Engine` against `src/components/PricingTable.tsx` returns zero matches.

- **SC-007 (maps to HFH.7)**: The "Multi-Brand Workspaces" row's Scale cell renders without a "Soon" badge.

- **SC-008 (maps to HFH.8)**: Lint, typecheck, and build all pass at the project root and inside `functions/`. The five grep checks (`"$197"`, `"15.20"`, `"$19/mo"`, `"Creative Scoring Engine"`, `"2 months free"`) each return zero matches in shipped code paths (i.e. excluding `**/__tests__/**` and `**/*.test.ts`).

## Out of Scope

Per the closing block of HOTFIX-H in `docs/LAUNCH_MATRIX.md`, the following are explicitly out of scope and MUST NOT be touched in this hotfix:

- The internal field name `creativeScoringEngine` in `planconfig.ts`, `entitlements.ts`, or `useBillingState.ts`. Renaming it is a separate, larger refactor.
- The file `functions/src/creativeScoringEngine.ts`. Internal name, never user-visible.
- The marketing site at `proadsai.com` (hosted on GHL). Handled separately via the GHL admin console.
- Stripe price IDs. Those are created in Phase 21 (Stripe migration), not this hotfix. Phase 21 already references the corrected $29/$79/$179 amounts after the prior doc-alignment pass.

## Assumptions

- A prior documentation-alignment pass on the `021-stripe-migration` branch already corrected every spec/doc reference to the final pricing and the "Predictive CTR Engine" label. The three code files this hotfix touches (`src/planconfig.ts` and `src/components/PricingTable.tsx`, plus the verification step) are the remaining gaps.
- Pro ($79 / $63.20) and Scale ($179 / $143.20) prices in `planconfig.ts` are already correct; this hotfix relies on that and does not re-verify them beyond the no-regression checks.
- Phase 12 (Multi-Brand Workspaces) has shipped, per Section 0.5 of the Launch Matrix; that is why the `Soon` badge is being removed.
- Test fixtures and `*.test.ts` files may legitimately contain historical strings like `"$19/mo"` for migration tests; the verification grep in FR-008 / SC-008 explicitly excludes them.
- The `npm` scripts `lint`, `typecheck`, and `build` exist and are operational at both the project root and inside `functions/`; this hotfix does not introduce or modify those scripts.
