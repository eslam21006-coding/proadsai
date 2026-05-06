# Implementation Plan: HOTFIX-H — Final Pricing & Naming Alignment

**Branch**: `022-hotfix-h-pricing-naming-alignment` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-hotfix-h-pricing-naming-alignment/spec.md`

## Summary

Apply 7 atomic in-place edits across two files (`src/planconfig.ts`, `src/components/PricingTable.tsx`) so the running app's pricing table and feature labels match the corrected, post-021-stripe-migration documentation: Starter $29 / $23.20 (was $19 / $15.20), the user-visible label "Creative Scoring Engine" → "Predictive CTR Engine" (internal field name `creativeScoringEngine` preserved), Offer Creative Modes row reflects actual `maxOfferModes` entitlements (`6 / All 21 / All 21`), Batch Rendering moves from Scale Exclusives to Render Studio (after Carousel Ads), and the stale `Soon` badge is removed from Multi-Brand Workspaces / Scale cell. An 8th task is the verification gate: lint + typecheck + build pass at root and in `functions/`, and 5 grep checks (`"$197"`, `"15.20"`, `"$19/mo"`, `"Creative Scoring Engine"`, `"2 months free"`) return zero matches outside test fixtures. No data migration, no entitlement logic change, no public-API change.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions). No version change.
**Primary Dependencies**: React 19, Vite 7, Tailwind CSS 3, Zustand 4 (frontend); Firebase Cloud Functions v2, Firebase Admin SDK (functions). No new dependencies.
**Storage**: N/A. No Firestore reads or writes. No schema migration. The two edited files contain in-code constants only.
**Testing**: Existing `npm run lint && npm run typecheck && npm run build` at repo root and inside `functions/` is the verification gate. No new automated tests are added or required by HFH.1–HFH.8 — verification is a build-gate plus 5 grep checks. Contract fixtures and Vitest suites under `functions/src/__tests__/**` are explicitly exempt from the grep gate (they may legitimately contain historical strings).
**Target Platform**: Web (browser-side React app served from Firebase Hosting; Cloud Functions runtime is Node 20).
**Project Type**: Web application (React frontend + Firebase Functions backend). Edits this hotfix are 100% frontend — only `src/planconfig.ts` and `src/components/PricingTable.tsx` change.
**Performance Goals**: N/A. Edits are static constant changes; no runtime path changes.
**Constraints**: (1) Must not rename the internal symbol `creativeScoringEngine` or the file `functions/src/creativeScoringEngine.ts`. (2) Must not touch Pro/Scale price values. (3) Must not touch any non-price field on the Starter plan record. (4) Must not modify entries marketing site (GHL) or Stripe price IDs (Phase 21). (5) Verification grep is scoped to `src/` and `functions/src/` excluding `**/__tests__/**` and `**/*.test.ts`.
**Scale/Scope**: 7 in-place code edits across 2 files. Estimated total diff: <30 lines. No tests added. No types changed. No exports added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 12 Core Principles in `.specify/memory/constitution.md` v1.1.0:

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Reliability Over Feature Count | **PASS** | This hotfix removes risk (mismatched in-app vs. checkout pricing) without adding any new feature surface. |
| II | The Selected Mode MUST Be Obeyed | **PASS** | No mode/format/language behavior changes. Only displayed price and labels. |
| III | Launch Surface Is Frozen and Authoritative | **PASS** | Aligns the in-app surface with the already-corrected launch documentation. Closes the doc-vs-code drift identified in 021-stripe-migration. |
| IV | Behavior Contracts Beat Subjective Judgment | **PASS** | Each FR-001..FR-008 has explicit pass/fail criteria sourced verbatim from the HFH.N Done-when column. |
| V | Arabic Quality Is First-Class | **PASS** | None of the touched strings are Arabic. The pricing table is English-only marketing copy. |
| VI | Hidden Machine Layers MUST Be Auditable | **PASS** | No resolver/build-plan/quality-loop layer is changed. No new hidden behavior added. |
| VII | No Silent Override Without Rule, Signal, and Trace | **PASS** | No override, no fallback, no auto-switch. Pure static-value alignment. |
| VIII | Cost Discipline Is Mandatory | **PASS** | Zero generation-cost impact. No model calls added or removed. |
| IX | Proof Is Required for Every Claimed Fix | **PASS** | spec.md restates the failing rule (HFH.1–HFH.8 Done-when), the controlling files (planconfig.ts, PricingTable.tsx), why the previous behavior occurred (021-pass left code untouched), and the verification (lint+typecheck+build + 5 grep checks). quickstart.md gives reproducible inputs. |
| X | Spec Before Code | **PASS** | spec.md is in place; this plan is the implementation plan; tasks.md follows from `/speckit.tasks`; only then does code change. |
| XI | Frontend and Backend MUST Agree on Truth | **PASS** | The pricing source of truth is `PLANS` in `src/planconfig.ts` (frontend) and the same shape is consumed via API responses; backend has no hardcoded Starter price (verified — no occurrence of `19` or `15.20` as a Starter price in `functions/src/`). The HFH.8 grep gate further enforces this. |
| XII | Deferred Scope MUST Remain Deferred | **PASS** | The Out of Scope block (creativeScoringEngine field rename, `creativeScoringEngine.ts` file rename, GHL marketing site, Stripe price IDs) is honored. None of those are touched. |

**Result**: All gates pass. No violations. **Complexity Tracking** section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/022-hotfix-h-pricing-naming-alignment/
├── plan.md                          # This file
├── spec.md                          # Feature specification (faithful HFH.1–HFH.8 restatement)
├── research.md                      # Phase 0 — confirms current code state, no unknowns
├── data-model.md                    # Phase 1 — in-code constants only; no Firestore changes
├── quickstart.md                    # Phase 1 — manual verification steps + automated gate
├── contracts/
│   └── ui-labels.md                 # Phase 1 — user-visible label/value contract
├── checklists/
│   └── requirements.md              # Spec quality checklist (already complete)
└── tasks.md                         # Phase 2 output — created by /speckit.tasks (not this command)
```

### Source Code (repository root)

The hotfix touches exactly two source files. The rest of the tree is reference only.

```text
src/
├── planconfig.ts                    # ⟵ EDITED (HFH.1, HFH.2): Starter price + label rename
├── components/
│   └── PricingTable.tsx             # ⟵ EDITED (HFH.3–HFH.7): 5 row-level edits
├── ...                              # untouched
└── (no new files)

functions/
└── src/
    └── creativeScoringEngine.ts     # untouched (Out of Scope)

docs/
└── LAUNCH_MATRIX.md                 # untouched (the source of truth for HFH; spec was derived from it)
```

**Structure Decision**: Existing Web Application structure (React frontend at `src/`, Firebase Functions at `functions/src/`). No structural change. No new files. No moved files. No new directories. Only line-level edits inside two existing source files.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. No entries.

## Phase 0 — Research Summary

See [research.md](./research.md) for full detail.

The research phase confirmed:

1. **No unknowns from the spec.** Every HFH.N row names file, identifier, current value, target value, and Done-when. Nothing in the spec was marked `NEEDS CLARIFICATION`.
2. **Current code state matches what HFH.N expects to find.** Direct grep on `src/planconfig.ts` confirms `priceMonthly: 19, priceAnnualPerMonth: 15.20` at line 171 and the user-facing label `'Creative Scoring Engine'` at line 140. Direct grep on `src/components/PricingTable.tsx` confirms `monthly: 19, annual: 15.20` at line 23, `'All 18+', 'All 18+', 'All 18+'` for Offer Creative Modes at line 46, Batch Rendering with `section: 'scale'` at line 63, the row label `'Creative Scoring Engine'` at line 64, and `soon: true` on the Multi-Brand Workspaces / Scale cell at line 67.
3. **No backend hardcoded references.** A grep across `functions/src/` for `19` or `15.20` as Starter prices returns no shipped-code matches; the only references are in test fixtures (excluded by HFH.8).
4. **Pro / Scale prices already correct** at `priceMonthly: 79 / 179` and `priceAnnualPerMonth: 63.20 / 143.20` (planconfig.ts:183, 196) and `monthly: 79 / 179, annual: 63.20 / 143.20` (PricingTable.tsx:24, 25). HFH-out-of-scope: do not touch.
5. **HFH.8 grep targets are absent or test-only.** Spot-grep for `"$197"`, `"$19/mo"`, `"2 months free"` shows no occurrences in `src/` shipped code today; the only post-edit risk is leaving `15.20` or `Creative Scoring Engine` somewhere — both addressed by HFH.1–HFH.6.

**No NEEDS CLARIFICATION markers remained at the end of Phase 0.**

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md), [contracts/ui-labels.md](./contracts/ui-labels.md), and [quickstart.md](./quickstart.md).

**data-model.md** documents the four in-code constants this hotfix touches and the four it explicitly does not, plus the read paths into each (which screens consume each constant). No Firestore entity is added or modified.

**contracts/ui-labels.md** is the user-visible-text contract for the pricing table. It lists every label/value the user will see after the hotfix, side-by-side with the current (pre-hotfix) text. It is the contract any UI smoke-test or manual QA pass should compare against.

**quickstart.md** lists the exact manual + automated steps to verify all 8 success criteria after applying the edits, including the 5 grep checks from HFH.8.

### Re-evaluation of Constitution Check post-design

All 12 gates re-evaluated after Phase 1 artifacts. **No new violations introduced.** The design phase produced documentation only; no code drift, no new abstractions, no new dependencies, no schema. Gate result: **PASS** unchanged.

## Stop Condition

Per `/speckit.plan` contract, this command stops here. The next step is `/speckit.tasks`, which will read this plan plus `data-model.md` and `contracts/ui-labels.md` and emit `tasks.md` (a dependency-ordered, parallelizable list of edits).
