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
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 5 billingStatus states with explicit transitions; 14 functional requirements with pass/fail rules |
| V. Arabic Quality Is First-Class | N/A | Billing page uses plan names and numbers — no language-specific content generation |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | `billingState` is the auditable trace for all plan/credit changes; cancellation records stored |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | Plan-gate rejection uses explicit `plan_downgraded` error code; downgrade enforcement is visible (features hidden/disabled); cancellation shows period end date |
| VIII. Cost Discipline Is Mandatory | PASS | Plan-gate enforcement prevents invalid credit consumption; no wasteful generation |
| IX. Proof Is Required for Every Claimed Fix | PASS | Unit test fixtures for billingState writes required (task 8.11 from LAUNCH_MATRIX) |
| X. Spec Before Code | PASS | Full spec with 9 user stories, 14 FRs, 8 success criteria, 5 clarifications completed |
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
│   ├── index.ts              # Existing — extend billing functions + add billingState writes
│   ├── entitlements.ts       # Existing — used by plan-gate enforcement (read-only)
│   └── billing/
│       └── billingState.ts   # NEW — buildBillingState() helper + writeBillingState() 

src/
├── hooks/
│   └── useBillingState.ts    # NEW — Firestore real-time listener for billingState
├── pages/
│   └── Billing.tsx           # NEW — Billing page component
├── components/
│   └── billing/
│       ├── CreditBar.tsx         # NEW — Credit usage bar
│       ├── PlanCard.tsx          # NEW — Current plan display
│       ├── TopUpSelector.tsx     # NEW — Top-up pack selection
│       ├── CancelDialog.tsx      # NEW — Two-step cancellation dialog
│       ├── PaymentFailedAlert.tsx # NEW — Payment failure alert with countdown
│       ├── TrialBanner.tsx       # NEW — App-wide trial expiry banner
│       ├── LowCreditsBanner.tsx  # NEW — App-wide low credits warning
│       └── ReactivateButton.tsx  # NEW — Subscription reactivation
├── planconfig.ts             # Existing — plan definitions (read-only)
├── creditCost.ts             # Existing — credit cost helpers (read-only)
├── store.ts                  # Existing — extend with billing navigation state
└── App.tsx                   # Existing — add billing route + app-wide banners
```

**Structure Decision**: Extends the existing flat project structure. Backend billing logic is extracted to `functions/src/billing/` to keep `index.ts` manageable. Frontend adds a `hooks/` directory (first hook) and `components/billing/` for billing-specific UI. No new projects or packages.

## Complexity Tracking

> No constitution violations to justify.
