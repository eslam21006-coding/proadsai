# Quickstart: Verify HOTFIX-H — Final Pricing & Naming Alignment

**Date**: 2026-05-06
**Branch**: `022-hotfix-h-pricing-naming-alignment`

> Use this checklist after applying the 7 in-place edits (HFH.1–HFH.7) to confirm the hotfix is complete. The full HFH.8 verification gate is the union of all checks below.

## Prerequisite

You are on branch `022-hotfix-h-pricing-naming-alignment` and the 7 edits have been applied to `src/planconfig.ts` and `src/components/PricingTable.tsx`. Working tree is otherwise clean (no unrelated unstaged changes that would skew the build).

## Step 1 — Build Gate (root)

From the repository root, run:

```powershell
npm run lint
npm run typecheck
npm run build
```

**Pass condition**: each command exits with code 0. No lint errors. No type errors. Vite produces a successful production bundle.

If any step fails, the failure points to the wrong character in one of the 7 edits — most commonly a stray comma, a misspelled property, or an accidental quote-style change. Read the error, find the offending line, fix in place, and re-run.

## Step 2 — Build Gate (`functions/`)

From the repository root:

```powershell
cd functions
npm run lint
npm run typecheck
npm run build
cd ..
```

**Pass condition**: each command exits with code 0.

> `functions/` is touched by neither HFH.1–HFH.7 nor anything else in this hotfix. The reason this gate is required is to confirm the change to `src/planconfig.ts` does not produce a downstream type error in any backend code that imports plan types from frontend (none expected, but the gate is cheap and the launch principle is "no surprises").

## Step 3 — Grep Gate (the five HFH.8 strings)

From the repository root, run each of the following and confirm zero matches in shipped code (test fixtures and `*.test.ts` files are exempt):

```powershell
# 1. Old Scale fake-price
git grep --untracked '\$197' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'

# 2. Old Starter annual-equivalent monthly price
git grep --untracked '15\.20' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'

# 3. Old Starter monthly price text
git grep --untracked '\$19/mo' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'

# 4. Old user-facing label
git grep --untracked 'Creative Scoring Engine' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'

# 5. Discontinued annual-savings phrasing
git grep --untracked '2 months free' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
```

**Pass condition**: each command produces no output (zero matches).

> Note: the `Grep` tool inside this repo's automation is the canonical search; the `git grep` lines above are equivalent and runnable from the user's shell.

## Step 4 — Positive Greps (the new strings ARE present)

This is not in HFH.8, but it is the cheapest way to confirm the rename happened (vs. accidentally deleted both old and new):

```powershell
# Should return at least 1 match in src/planconfig.ts
git grep 'Predictive CTR Engine' -- src/planconfig.ts

# Should return at least 1 match in src/components/PricingTable.tsx
git grep 'Predictive CTR Engine' -- src/components/PricingTable.tsx

# Identifier MUST still be present (do NOT touch this — Out of Scope)
git grep 'creativeScoringEngine' -- src/planconfig.ts
```

**Pass condition**: all three return at least one match.

## Step 5 — Spot-Check Starter Prices in Code

```powershell
git grep -n 'priceMonthly: 29' -- src/planconfig.ts
git grep -n 'priceAnnualPerMonth: 23\.20' -- src/planconfig.ts
git grep -n 'monthly: 29' -- src/components/PricingTable.tsx
git grep -n 'annual: 23\.20' -- src/components/PricingTable.tsx
```

**Pass condition**: each command finds exactly one match (the Starter row in each file). Pro/Scale prices unchanged.

## Step 6 — Manual UI QA

Run `npm run dev`, open the app, navigate to the pricing table, and confirm against [contracts/ui-labels.md](./contracts/ui-labels.md):

- [ ] Monthly toggle: Starter shows **$29/mo**, Pro shows $79/mo, Scale shows $179/mo.
- [ ] Annual toggle: Starter shows **$23.20/mo**, Pro shows $63.20/mo, Scale shows $143.20/mo.
- [ ] "Offer Creative Modes" row shows **6 / All 21 / All 21**.
- [ ] "Batch Rendering" appears inside the Render Studio section, immediately below "Carousel Ads".
- [ ] "Batch Rendering" does **not** appear in the Scale Exclusives section.
- [ ] The Scale Exclusives section contains a row labeled **"Predictive CTR Engine"** (no occurrence of "Creative Scoring Engine").
- [ ] The "Multi-Brand Workspaces" row's Scale cell renders without a "Soon" badge.

## Mapping to Success Criteria

| Step | Verifies |
|---|---|
| Step 1 (root build) | SC-008 (root build pass), implicit gate against typos in HFH.1–HFH.7 |
| Step 2 (functions build) | SC-008 (functions build pass) |
| Step 3 (negative greps) | SC-008 (all 5 grep checks zero), SC-002 (`Creative Scoring Engine` zero in planconfig.ts), SC-006 (`Creative Scoring Engine` zero in PricingTable.tsx) |
| Step 4 (positive greps) | SC-002 (`Predictive CTR Engine` ≥1 match), SC-006 (renamed in PricingTable.tsx), `creativeScoringEngine` identifier preserved |
| Step 5 (Starter price spot-check) | SC-001 (planconfig.ts numeric values), SC-003 (PricingTable.tsx numeric values) |
| Step 6 (manual UI) | SC-003 (rendered prices), SC-004 (Offer Creative Modes row), SC-005 (Batch Rendering moved), SC-006 (Predictive CTR Engine label rendered), SC-007 (no Soon badge) |

## Failure Modes (and where to look)

| Symptom | Likely cause | Where to fix |
|---|---|---|
| Build fails with TypeScript error in `planconfig.ts` | Comma or quote typo in the Starter record | `src/planconfig.ts:171` |
| Build passes but `Creative Scoring Engine` still appears in grep | One of HFH.2 / HFH.6 not applied | `src/planconfig.ts:140` and/or `src/components/PricingTable.tsx:64` |
| Pricing card still shows `$19/mo` after build | HFH.1 missed — `priceMonthly` still `19` | `src/planconfig.ts:171` |
| Pricing card still shows `$15.20` annual | HFH.1 missed — `priceAnnualPerMonth` still `15.20` | `src/planconfig.ts:171` |
| "Batch Rendering" appears in Scale Exclusives | HFH.5 — only the `section` value changed, but the row was not physically moved (or vice versa) | `src/components/PricingTable.tsx` — confirm the row is positioned immediately after the `'Carousel Ads'` row |
| "Soon" badge still on Multi-Brand Workspaces / Scale | HFH.7 — `soon: true` still present | `src/components/PricingTable.tsx:67` (third value object) |
| Pro or Scale prices changed | Edit overshot — Pro and Scale must be unchanged | revert non-Starter rows in `plans` and non-Starter records in `PLANS` |
| `creativeScoringEngine` identifier missing | Edit overshot — only the user-facing **label** is renamed | restore the identifier in all 6 occurrences listed in [data-model.md](./data-model.md) §"In-Code Constants Explicitly NOT Touched" |
