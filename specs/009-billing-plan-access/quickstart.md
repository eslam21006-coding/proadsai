# Quickstart: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04

## Prerequisites

- Node.js 20+ (Firebase Functions v2 requirement)
- Firebase CLI (`npm install -g firebase-tools`)
- Access to Stripe dashboard (for webhook secrets and test mode)
- Access to GHL (GoHighLevel) for payment webhook testing

## Setup

```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start local dev server
npm run dev
```

## Key Files to Understand First

1. **`functions/src/entitlements.ts`** — Plan definitions, feature gates, `resolveEntitlement()`, `checkFeature()`. This is the authoritative source for what each plan allows.

2. **`src/planconfig.ts`** — Frontend mirror of plan config. `PLANS`, `canUse()`, `TOPUP_PACKS`, `CREDIT_COSTS`.

3. **`functions/src/index.ts`** — All Cloud Functions. The billing-related ones: `ghlpaymentwebhook`, `ghlCancellationWebhook`, `stripeWebhook`, `createTopupCheckout`, `createStripePortalSession`, `cancelSubscription`, `deductCreditsServer`, `monthlyCreditsReset`.

4. **`src/store.ts`** — Zustand store. Contains `userPlan`, `userCredits`, `setUserPlan()`, `setUserCredits()`.

5. **`src/App.tsx`** — Main app component. Phase-based navigation (no React Router). Auth state listener. Conditional rendering based on `AppPhase`.

## Implementation Order

### Phase 1: Backend Foundation
1. Create `functions/src/billing/billingState.ts` — `buildBillingState()` + `writeBillingState()`
2. Wire `writeBillingState()` into all 7 billing paths in `index.ts`
3. Change `monthlyCreditsReset` to additive (`credits += creditsPerMonth`)
4. Add plan-gate check in `deductCreditsServer` using `resolveEntitlement()` + `checkFeature()`
5. Add `ACTION_FEATURE_MAP` to `entitlements.ts`
6. Add `reactivateSubscription` callable
7. Extend `cancelSubscription` with reason/feedback fields

### Phase 2: Frontend Foundation
1. Create `src/hooks/useBillingState.ts` — Firestore real-time listener
2. Add `'billing'` to `AppPhase` type in store
3. Add billing nav link to header/sidebar

### Phase 3: Billing Page
1. Build `src/pages/Billing.tsx` with section layout
2. Build components: `CreditBar`, `PlanCard`, `TopUpSelector`, `CancelDialog`, `PaymentFailedAlert`, `ReactivateButton`
3. Wire top-up flow (calls `createTopupCheckout`)
4. Wire cancellation flow (two-step dialog → `cancelSubscription`)
5. Wire reactivation (calls `reactivateSubscription`)
6. Wire "Manage subscription" button (calls `createStripePortalSession`)

### Phase 4: App-Wide Banners & Enforcement
1. Build `TrialBanner` and `LowCreditsBanner` components
2. Add banners to `App.tsx` (rendered outside phase-specific content)
3. Implement downgrade enforcement — `useBillingState()` drives `canUse()` checks in real time
4. Handle `plan_downgraded` error in frontend credit-consuming actions

### Phase 5: Testing & Validation
1. Unit test fixtures for `buildBillingState()` with all billing events
2. Manual testing of all billing flows (Stripe test mode)

## Testing Approach

- **Backend**: `cd functions && npm test` — fixture-based tests for `buildBillingState()` writes
- **Frontend**: Manual testing with Stripe test mode cards
- **Stripe test cards**: `4242424242424242` (success), `4000000000000341` (payment failure)
- **Webhook testing**: Use Firebase emulator or Stripe CLI for local webhook forwarding

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| billingState location | Derived field on user doc | Single read, real-time listener, no join needed |
| Navigation | New AppPhase, not React Router | Consistent with existing app architecture |
| Credit reset | Additive (credits accumulate) | Product decision — top-up credits carry over |
| Grace period | Stripe-managed | No app-level configuration needed |
| Plan-gate check | Outside Firestore transaction | Entitlement reads are stable, avoid transaction scope bloat |
| Reactivation | Separate function (not toggle on cancel) | Semantic clarity |
