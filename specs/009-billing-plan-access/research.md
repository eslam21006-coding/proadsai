# Research: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04

## R1: billingState Write Strategy

**Decision**: Extract a `buildBillingState()` pure function and a `writeBillingState(uid)` Firestore helper into `functions/src/billing/billingState.ts`. Every billing path calls `writeBillingState()` after mutating plan/credits.

**Rationale**: The existing `index.ts` has 9 billing functions that each independently write plan/credits fields. Centralizing the billingState computation eliminates the risk of inconsistent writes and makes testing trivial (unit-test `buildBillingState()` with fixture data).

**Alternatives considered**:
- Firestore trigger (`onDocumentUpdated`) that recomputes billingState whenever user doc changes — rejected because it adds latency (extra function invocation) and complexity (must filter non-billing writes).
- Frontend-computed billing state — rejected because it violates constitution principle XI (frontend and backend must agree on truth).

## R2: Monthly Credit Reset — Accumulation Model

**Decision**: Change `monthlyCreditsReset` from `credits = creditsPerMonth` to `credits += creditsPerMonth`. The existing code resets credits to the plan allocation; this must be changed to additive.

**Rationale**: Product decision (clarification session 2026-04-04). Top-up credits and unused monthly credits carry over across billing cycles. This is a single-line change in the batch update within `monthlyCreditsReset`.

**Alternatives considered**:
- Separate top-up balance field tracked independently — rejected as over-engineering; a single `credits` field with additive reset is simpler and sufficient.

## R3: billingStatus State Machine

**Decision**: Five states: `active`, `trialing`, `past_due`, `cancelling`, `cancelled`. Transitions:

```
trialing → active (first payment)
trialing → cancelled (trial expired + 0 credits + no upgrade)
active → past_due (payment failed)
active → cancelling (user cancels, access until period end)
past_due → active (payment recovered)
past_due → cancelled (grace period expired)
cancelling → active (user reactivates before period end)
cancelling → cancelled (period end reached)
cancelled → active (new subscription via GHL webhook)
```

**Rationale**: Covers the full lifecycle including the "cancelling" interim state where access continues. Maps cleanly to Stripe subscription statuses.

**Alternatives considered**:
- Four states using `isTrial` flag instead of `trialing` status — rejected because `billingStatus` should be self-contained for UI rendering without cross-referencing `isTrial`.
- Six states with `paused` — rejected; subscription pausing is not in scope.

## R4: Billing Page Navigation (No React Router)

**Decision**: Add billing as a new `AppPhase` value (e.g., `'billing'`) in the existing phase-based navigation system in `App.tsx` and `store.ts`. Render `<Billing />` conditionally like other phases.

**Rationale**: The app uses conditional rendering based on `AppPhase` state in Zustand, not React Router. Adding a billing phase is consistent with the existing pattern. A nav link in the sidebar/header triggers `setAppPhase('billing')`.

**Alternatives considered**:
- Add React Router — rejected; would require refactoring the entire navigation system for a single page addition.
- Modal/drawer overlay — rejected; billing needs a full page for proper layout of plan details, credit bar, top-up packs, and cancellation flow.

## R5: Plan-Gate Enforcement in deductCreditsServer

**Decision**: Add a `resolveEntitlement()` call at the top of `deductCreditsServer` before the credit deduction transaction. Use `checkFeature()` to verify the action is allowed. Reject with `functions.https.HttpsError('failed-precondition', 'plan_downgraded', { requiredPlan })`.

**Rationale**: `resolveEntitlement()` and `checkFeature()` already exist in `entitlements.ts` and handle team member resolution. The deductCreditsServer currently only checks credit balance, not plan entitlement. Adding the check before the transaction is correct because plan changes are infrequent and the entitlement read doesn't need to be inside the transaction.

**Alternatives considered**:
- Entitlement check inside the Firestore transaction — rejected; `resolveEntitlement()` reads from team memberships which would complicate the transaction scope. Entitlement is stable enough to read outside.

## R6: Grace Period Data Source

**Decision**: Read `gracePeriodEndsAt` from Stripe subscription data via the `customer.subscription.updated` webhook event. Store in billingState for frontend countdown display.

**Rationale**: Product decision (clarification session 2026-04-04). Stripe manages dunning schedules and retry timing. The app reads the computed date rather than maintaining its own grace period logic.

**Alternatives considered**:
- App-level grace period with configurable duration — rejected per product decision.

## R7: Reactivation Flow

**Decision**: Add a `reactivateSubscription` callable Cloud Function that calls `stripe.subscriptions.update(subId, { cancel_at_period_end: false })` and updates billingState from `cancelling` → `active`.

**Rationale**: Stripe supports clearing `cancel_at_period_end` natively. The existing `cancelSubscription` function sets this flag; reactivation simply clears it. This is a new function (not an extension of `cancelSubscription`) for clarity.

**Alternatives considered**:
- Reuse `cancelSubscription` with a toggle parameter — rejected for clarity; cancel and reactivate are semantically distinct operations.

## R8: Action-to-Feature Mapping for Plan Gates

**Decision**: Create a `ACTION_FEATURE_MAP` in `entitlements.ts` that maps COSTS action keys to feature gate keys. For actions that don't require a specific feature (e.g., `generateHooks`, `generateConcepts`, `buildPlan`), the map returns `null` (always allowed for any paid plan).

```
generateCarouselCopies → 'carousel'
competitorResearch → 'competitorResearch'
generateImage → null (all plans)
generateHooks → null (all plans)
editRegion → 'regionEditing'
brandUrlScraping → 'brandUrlScraping'
...
```

**Rationale**: The existing `COSTS` map and `checkFeature()` function operate on different key spaces. A mapping table bridges them without modifying either existing structure.

**Alternatives considered**:
- Merge COSTS and features into a single config — rejected; would require changing both frontend and backend config structures.
