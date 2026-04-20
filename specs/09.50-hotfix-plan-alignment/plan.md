# Implementation Plan: Plan Structure Alignment Hotfix (Phases 1–9)

**Branch**: `hotfix/plan-alignment` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/09.50-hotfix-plan-alignment/spec.md`

## Summary

Pure alignment hotfix. The pricing page has been finalised at **3 plans** (`starter` / `pro` / `scale`); Phases 1–9 shipped against a 4-plan structure (`starter` / `creator` / `pro` / `scaling`). No new features are added. This hotfix (a) deletes every `creator` code path, (b) renames `scaling` → `scale` everywhere, (c) adds four new per-plan limits to the plan config (`savedProjectLimit`, `audienceAvatarLimit`, `batchConfig`, `carouselMaxSlides`), (d) un-gates the full creative library (hook angles / hook types / copywriting strategies / ad tones) on every paid plan, (e) re-gates retargeting / fantasy / art direction / batch / reference-ads at Pro+ (previously Creator+), (f) enforces new numeric caps on carousel slides (Pro 7, Scale 10) and batch ads-per-run (Pro 4, Scale 36), and (g) adds read-time legacy-plan mapping so existing Firestore records with `plan: 'creator'` are treated as `pro` and `plan: 'scaling'` as `scale`. Contract fixtures that targeted Creator are repointed to Pro.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: React 19, Zustand, Tailwind CSS 3, Firebase Cloud Functions v2, Firebase Auth, `@paddle/paddle-node-sdk` (backend), Paddle.js v2 (client-side)
**Storage**: Firestore — `users/{uid}` (with embedded `billingState` sub-object). No schema additions; only value normalisation (`'creator' → 'pro'`, `'scaling' → 'scale'`) on read.
**Testing**: Jest — `functions/src/billing/__tests__/billingState.test.ts` and `functions/src/contractFixtures.test.ts` are updated; new fixtures added for plan-structure invariants (3-plan enumeration, Pro batch cap 4, Scale batch cap 36, Pro carousel cap 7, Scale carousel cap 10, legacy read-time mapping).
**Target Platform**: Web (React SPA on Firebase Hosting, Firebase Cloud Functions v2 in `europe-west1`).
**Project Type**: Web application (React frontend + Firebase Cloud Functions backend).
**Performance Goals**: No regression vs. pre-hotfix. Billing state resolution remains under 3 s; entitlement resolver is synchronous and must not add a DB read.
**Constraints**: (1) Legacy Firestore records with `plan: 'creator'` or `plan: 'scaling'` MUST continue to produce correct entitlements via a read-time map — no background migration required for launch; (2) soft-grandfather existing over-cap saved-project / audience-avatar counts (all existing records stay accessible; only new creations are blocked); (3) type union MUST be exactly `'none' | 'starter' | 'pro' | 'scale'` with zero references to legacy literals anywhere under `src/` or `functions/src/`.
**Scale/Scope**: Pre-launch SaaS; minimal existing users but legacy-record mapping required for safety. 10 hotfix tasks (HF.1–HF.10 from `docs/LAUNCH_MATRIX.md`) touching ~12 files. 29 functional requirements, 8 success criteria, 5 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | This hotfix is a strict *reduction* — one plan tier removed, identifier surface narrowed to three. No new feature is introduced. Aligns with "reduction of scope is a product-strength decision." |
| II. The Selected Mode MUST Be Obeyed | PASS | When a user selects a plan, the system MUST honour it. The Creator→Pro mapping is a documented explicit override (not silent drift): legacy records are remapped on read; the user sees the resolved `pro` plan in UI. |
| III. Launch Surface Is Frozen and Authoritative | PASS | LAUNCH_MATRIX Sections 13 (row 13) and 14 (HF.1–HF.10) are authoritative. Every older reference to the 4-plan world in shipped code is corrected by this hotfix. Pricing page wins over stale code. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Explicit pass/fail rules for every gate: FR-008 (batch caps), FR-009 (carousel caps), FR-015–FR-019 (feature gates), FR-020 ("Upgrade to Pro" locked-state affordance required — no silent hide). Contract fixtures (HF.10) encode these. |
| V. Arabic Quality Is First-Class | PASS | No new user-visible strings introduced. Locked-state affordance ("Upgrade to Pro") reuses existing i18n keys — no untranslated surface. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Legacy-plan read-time mapping is a *visible, documented* transformation (logged via existing structured-logger at the billingState read path). Not hidden. |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | The two overrides in this hotfix — `'creator' → 'pro'`, `'scaling' → 'scale'` — are (a) explicitly defined by product rule (Clarifications session + FR-003), (b) not user-visible because the Creator tier is discontinued, and (c) traceable via structured logs emitted at read time. |
| VIII. Cost Discipline Is Mandatory | PASS | No new generation logic. Read-time mapping adds a constant-time string comparison — no extra DB reads. Entitlement checks stay synchronous. |
| IX. Proof Is Required for Every Claimed Fix | PASS | Every FR has (a) an acceptance scenario in the spec, (b) a contract fixture in `contractFixtures.test.ts` or `billingState.test.ts`, and (c) a post-deploy verification step in `quickstart.md`. `grep -r "creator\|scaling" src/ functions/src/` returning zero plan-related hits is the codebase-wide acceptance evidence (SC-001). |
| X. Spec Before Code | PASS | Spec has 5 user stories, 29 functional requirements, 8 success criteria, and one completed clarification session. This plan precedes all code changes. |
| XI. Frontend and Backend MUST Agree on Truth | PASS | The single `PLANS` record in `src/planconfig.ts` and `entitlements.ts`' `PLAN_FEATURES` are the dual source of truth — both must be updated in lock-step. HF.1 (frontend plan config) and HF.2 (backend entitlements) are paired tasks. Backend `validateLaunchSurface` enforces the same rules the frontend UI shows. |
| XII. Deferred Scope MUST Remain Deferred | PASS | Creator-tier is explicitly retired. No feature previously gated to Creator is brought back as a new Creator-only capability. Paddle-dashboard price-map changes are deferred to ops (documented in spec Assumptions). |

**Post-Phase 1 Re-check**: All 12 principles remain PASS after the Phase 1 artefacts are written. Data model is purely a subset of pre-hotfix state. Contracts formalise existing behaviour, they do not expand surface. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/09.50-hotfix-plan-alignment/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (5 user stories, 29 FRs, 8 SCs, 1 clarification session)
├── research.md          # Phase 0 — alignment decisions + file audit
├── data-model.md        # Phase 1 — PlanConfig, Entitlement, UserBillingState (3-plan shape)
├── quickstart.md        # Phase 1 — post-deploy validation walkthrough
├── contracts/
│   ├── planconfig-schema.md       # The 3-plan PLANS record shape + field constraints
│   └── entitlement-resolver.md    # resolveEntitlement() input/output contract
├── tasks.md             # Phase 2 output (regenerate via /speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

Files touched by this hotfix (audit of current codebase; see `research.md` for full map):

```text
functions/
├── src/
│   ├── index.ts                                  # HF.9 — remove PLAN_NAMES/PLAN_LIMITS/PLAN_TEAM_LIMITS creator+scaling
│   ├── entitlements.ts                           # HF.2 — delete creator/scaling plan entries, un-gate hook/tone/strategy/tone, re-gate at Pro+
│   ├── creativeResolver.ts                       # HF.3 — remove creator from plan hierarchy, batch/retargeting at Pro+
│   ├── generators.ts                             # HF.6, HF.7 — enforce Pro batch-4 / Scale batch-36, Pro carousel-7 / Scale carousel-10
│   ├── contractFixtures.test.ts                  # HF.10 — repoint creator fixtures to pro, scaling → scale
│   ├── billing/
│   │   ├── billingState.ts                       # HF.9 + FR-003 — remove PLAN_CREDITS.creator/.scaling; add read-time map (creator→pro, scaling→scale) in buildBillingState()
│   │   └── __tests__/
│   │       └── billingState.test.ts              # HF.10 — migrate 6 creator + 4 scaling fixtures; add 2 legacy-mapping fixtures
│   └── paddle/
│       └── paddleClient.ts                       # HF.9 — remove creator/scaling from PLAN_CREDITS; PADDLE_PRICE_TO_PLAN remaps creator price IDs to { plan: 'pro' }, scaling price IDs to { plan: 'scale' }

src/
├── planconfig.ts                                 # HF.1, HF.8 — rewrite PLANS: delete creator, rename scaling → scale, add savedProjectLimit / audienceAvatarLimit / batchConfig / carouselMaxSlides; UserPlan union becomes 'none' | 'starter' | 'pro' | 'scale'
├── types.ts                                      # HF.8 — (no change; UserPlan is re-exported from planconfig — verify)
├── store.ts                                      # HF.8 — verify userPlan field still uses UserPlan (which now has 3 paid values)
├── App.tsx                                       # HF.8 — replace plan arrays, checkout-URL keys (creator_monthly → (deleted), scaling_monthly → scale_monthly), plan-hierarchy comparisons
├── components/
│   ├── InputForm.tsx                             # HF.4, HF.5 — remove per-plan filtering for hook angles/types/strategies/tones; gate fantasy/retargeting/batch/reference-ads to Pro+; carousel slide-count shows 2–7 for Pro, 2–10 for Scale; batch UI label per plan
│   └── PricingTable.tsx                          # HF.4 — delete creator section, rename scaling section to scale, update PLANS_CONFIG keys + UI strings
```

**Structure Decision**: No new directories. Every change lands in an already-existing file. The split between frontend (`src/`) and backend (`functions/src/`) is preserved. Two logical seams are formalised as contract documents (`contracts/planconfig-schema.md`, `contracts/entitlement-resolver.md`) to encode the shape that both sides must agree on (Principle XI).

## Complexity Tracking

> No constitution violations to justify. All 12 principles pass. Section intentionally empty.
