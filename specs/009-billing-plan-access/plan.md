# Implementation Plan: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-billing-plan-access/spec.md`

## Summary

Build a unified `billingState` field on the Firestore user document, written by all backend billing paths (GHL webhooks, Stripe webhooks, monthly reset, top-up, cancellation), and consumed by a new real-time `useBillingState()` hook. Add server-side plan-gate enforcement in `deductCreditsServer`. Build a new Billing page with plan display, credit bar, top-up checkout, two-step cancellation, reactivation, and payment failure alerts. Add app-wide banners for trial expiry, low credits, and downgrade enforcement.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Stripe SDK 20.x, React 19, Zustand 5, Tailwind CSS 3
**Storage**: Firestore (`users/{uid}`, `cancellations/{docId}`, `pending_plans/{email}`)
**Testing**: firebase-functions-test (backend), manual + fixture assertions
**Target Platform**: Web (SPA hosted on Firebase Hosting)
**Project Type**: Web application (React SPA + Firebase Cloud Functions backend)
**Performance Goals**: Billing page load <2s, real-time state propagation <3s, downgrade enforcement <5s
**Constraints**: All credit writes use Firestore transactions; monthly reset uses 500-doc batches; grace period is Stripe-managed
**Scale/Scope**: 4 plan tiers, 5 billing statuses, 3 top-up packs, 17 credit-consuming actions, team credit pooling

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Reliability Over Feature Count | PASS | Phase adds billing surface only — no new generation modes or creative features |
| II. The Selected Mode MUST Be Obeyed | PASS | Plan selection governs feature access; no silent drift |
| III. Launch Surface Is Frozen | PASS | Billing is infrastructure — does not alter the creative launch surface |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 5 billingStatus states with explicit transitions; 15 functional requirements with pass/fail rules |
| V. Arabic Quality Is First-Class | N/A | Billing page uses plan names and numbers — no language-specific content generation |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | `billingState` is the auditable trace for all plan/credit changes; cancellation records stored |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | Plan-gate rejection uses explicit `plan_downgraded` error code; downgrade enforcement is visible (features hidden/disabled); cancellation shows period end date |
| VIII. Cost Discipline Is Mandatory | PASS | Plan-gate enforcement prevents invalid credit consumption; no wasteful generation |
| IX. Proof Is Required for Every Claimed Fix | PASS | Unit test fixtures for billingState writes required (task 8.11 from LAUNCH_MATRIX) |
| X. Spec Before Code | PASS | Full spec with 9 user stories, 15 FRs, 8 success criteria, 5 clarifications completed |
| XI. Frontend and Backend MUST Agree on Truth | PASS | Server-side plan-gate in `deductCreditsServer` + frontend `useBillingState()` real-time listener — both layers enforce plan rules |
| XII. Deferred Scope MUST Remain Deferred | PASS | Team billing UI deferred to Phase 9; Phase 8 includes only `isTeamMember`/`teamOwnerUid` gating |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/009-billing-plan-access/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── billingState.ts  # BillingState interface
│   └── billing-api.md   # Cloud Function callable contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── index.ts              # EXISTING — extend with billingState writes on all billing paths
│   ├── entitlements.ts       # EXISTING — add ACTION_FEATURE_MAP, used by plan-gate enforcement
│   └── billing/
│       ├── billingState.ts   # EXISTING — exports buildBillingState() + writeBillingState()
│       └── __tests__/
│           └── billingState.test.ts  # EXISTING — 31 assertions, all passing

src/
├── hooks/
│   └── useBillingState.ts    # EXISTING — exports useBillingState() hook (Firestore onSnapshot listener)
├── pages/
│   └── Billing.tsx           # EXISTING — fully wired with useBillingState() hook
├── components/
│   ├── InputForm.tsx         # EXISTING — needs migration from userData.plan/credits to useBillingState() (FR-015)
│   └── billing/
│       ├── CreditBar.tsx         # EXISTING — credit usage bar component
│       ├── PlanCard.tsx          # EXISTING — current plan display
│       ├── TopUpSelector.tsx     # EXISTING — top-up pack selection
│       ├── CancelDialog.tsx      # EXISTING — two-step cancellation dialog
│       ├── PaymentFailedAlert.tsx # EXISTING — payment failure alert with countdown
│       ├── TrialBanner.tsx       # VERIFY — app-wide trial expiry banner
│       ├── LowCreditsBanner.tsx  # VERIFY — app-wide low credits warning
│       └── ReactivateButton.tsx  # EXISTING — subscription reactivation
├── planconfig.ts             # EXISTING — plan definitions (read-only)
├── creditCost.ts             # EXISTING — credit cost helpers (read-only)
├── store.ts                  # EXISTING — extend with billing navigation state
└── App.tsx                   # EXISTING — add billing route + app-wide banners
```

**Structure Decision**: Extends the existing project structure. All billing files are implemented: backend `billingState.ts` (buildBillingState + writeBillingState), frontend `useBillingState.ts` hook, Billing page, and all billing components with i18n support.

## Complexity Tracking

> No constitution violations to justify.

## Post-Design Constitution Re-Check (2026-04-08)

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Reliability Over Feature Count | PASS | No new generation modes; billing infrastructure only |
| II. The Selected Mode MUST Be Obeyed | PASS | Plan selection governs feature access; no silent drift |
| III. Launch Surface Is Frozen | PASS | Billing is infrastructure — does not alter creative launch surface |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 15 FRs with explicit pass/fail rules; 5 billingStatus states with defined transitions |
| V. Arabic Quality Is First-Class | N/A | Billing page uses plan names and numbers — no language-specific content |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | `billingState` is the auditable trace; cancellation records stored |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | `plan_downgraded` error code; downgrade enforcement visible; cancellation shows period end |
| VIII. Cost Discipline Is Mandatory | PASS | Plan-gate prevents invalid credit consumption; overwrite reset prevents credit accumulation |
| IX. Proof Is Required for Every Claimed Fix | PASS | Fixture tests for billingState writes (existing test file) |
| X. Spec Before Code | PASS | Full spec: 9 user stories, 15 FRs, 8 success criteria, 5 clarifications |
| XI. Frontend and Backend MUST Agree on Truth | PASS | Server-side plan-gate + frontend `useBillingState()` real-time listener; FR-015 ensures single data source |
| XII. Deferred Scope MUST Remain Deferred | PASS | Team billing UI deferred to Phase 9; only `isTeamMember`/`teamOwnerUid` gating in Phase 8 |

**Post-design gate: ALL PASS.**
