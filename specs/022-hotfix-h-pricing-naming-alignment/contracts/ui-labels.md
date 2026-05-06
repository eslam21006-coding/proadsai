# UI Labels Contract: HOTFIX-H

**Date**: 2026-05-06
**Branch**: `022-hotfix-h-pricing-naming-alignment`

> This is the user-visible-text contract for the in-app pricing table after HOTFIX-H is applied. Every label and value listed below is what the user MUST see when the rendered `<PricingTable />` and any `buildFeatureLabels()`-driven plan-feature list load. Manual UI QA and any future smoke test should compare against this contract.

This hotfix exposes no new external API endpoint, no new callable, no new payload shape. The "contract" is the surface visible to the customer reading the pricing table.

## 1. Pricing-Table Column Headers

`<PricingTable />` renders three columns from the `plans` array in `src/components/PricingTable.tsx`. After HOTFIX-H, the per-column displayed values are:

| Column | Plan name | Subtitle | Monthly toggle ON | Annual toggle ON |
|---|---|---|---|---|
| 1 | **Starter** | Get hooked | **$29/mo** | **$23.20/mo** |
| 2 | **Pro** | Full production | **$79/mo** | **$63.20/mo** |
| 3 | **Scale** | AI runs the show | **$179/mo** | **$143.20/mo** |

> **Pre-hotfix Starter values** were `$19/mo` and `$15.20/mo`. Pro and Scale columns are unchanged from pre-hotfix.

## 2. Pricing-Table Feature Rows — Touched Rows Only

The rows below are the only ones whose rendered text or position changes. Every other row in the `featureRows` array is untouched.

### 2.1 Offer Creative Modes (section: Render Engine)

| | Starter | Pro | Scale |
|---|---|---|---|
| **Pre-hotfix** | All 18+ | All 18+ | All 18+ |
| **Post-hotfix (REQUIRED)** | **6** | **All 21** | **All 21** |

The post-hotfix values reflect actual `maxOfferModes` entitlements from `PLANS` (Starter = 6, Pro/Scale = 21).

### 2.2 Batch Rendering — section change AND physical move

| Property | Pre-hotfix | Post-hotfix (REQUIRED) |
|---|---|---|
| `section` | `'scale'` (rendered under Scale Exclusives) | `'studio'` (rendered under Render Studio) |
| Position in `featureRows` | After Performance Dashboard, before Creative Scoring Engine (in Scale Exclusives) | Immediately after Carousel Ads (in Render Studio), before the next section's first row |
| `values` | `[false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }]` | (unchanged) |

### 2.3 Creative Scoring Engine → Predictive CTR Engine (section: Scale Exclusives)

| Property | Pre-hotfix | Post-hotfix (REQUIRED) |
|---|---|---|
| `label` | `'Creative Scoring Engine'` | **`'Predictive CTR Engine'`** |
| `note` | `'AI ranks your creatives by predicted CTR'` | (unchanged) |
| `section` | `'scale'` | (unchanged) |
| `values` | `[false, false, { text: '✓ Scale only', emphasis: true }]` | (unchanged) |

### 2.4 Multi-Brand Workspaces — Scale cell only (section: Scale Exclusives)

| Cell | Pre-hotfix | Post-hotfix (REQUIRED) |
|---|---|---|
| Starter | `false` | (unchanged) |
| Pro | `false` | (unchanged) |
| Scale | `{ text: '✓ Scale only', emphasis: true, soon: true }` | **`{ text: '✓ Scale only', emphasis: true }`** (the `soon: true` property removed) |

The rendered Scale cell MUST NOT show a "Soon" badge.

## 3. Plan-Feature Label List (driven by `buildFeatureLabels()` in `planconfig.ts`)

| Pre-hotfix label | Post-hotfix label (REQUIRED) | Notes |
|---|---|---|
| `Creative Scoring Engine` | **`Predictive CTR Engine`** | Internal `key` value `'creativeScoringEngine'` (lowercase, no spaces) is unchanged. |

## 4. Negative Assertions (what the user MUST NOT see)

After the hotfix, the following strings MUST NOT appear anywhere the user sees:

- `$19/mo` — old Starter monthly price
- `$15.20/mo` (or the bare `15.20`) — old Starter annual-equivalent monthly price
- `$197` — never the correct Scale price (Scale is $179)
- `Creative Scoring Engine` — replaced by `Predictive CTR Engine` user-side
- `2 months free` — discontinued annual-savings phrasing
- `Soon` badge in the Multi-Brand Workspaces / Scale cell

These are also the five strings the HFH.8 grep gate enforces on shipped code (excluding `**/__tests__/**` and `**/*.test.ts`).

## 5. Contract Validation Method

This contract is validated by:

1. **Manual UI QA** — render the pricing table with monthly and annual toggles, compare every visible label/value against Sections 1–4 above.
2. **Automated grep gate** — Section 4's negative assertions are verified by the five greps in HFH.8.
3. **Build gate** — `npm run lint && npm run typecheck && npm run build` at root and inside `functions/`. Build success is necessary but not sufficient (it cannot detect a wrong-but-valid string); Sections 1–4 are sufficient when combined with the grep gate.

No automated UI-snapshot test is added by this hotfix (intentional — see [research.md](../research.md), Decision 3).
