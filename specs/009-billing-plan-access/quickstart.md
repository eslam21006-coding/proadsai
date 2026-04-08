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

### Phase 1: Backend Foundation (CRITICAL — 2 missing files block everything)
1. **CREATE** `functions/src/billing/billingState.ts` — `buildBillingState()` + `writeBillingState()` (imported in index.ts but file doesn't exist — backend deploy will fail)
2. Wire `writeBillingState()` into all 7 billing paths in `index.ts` (calls exist but resolve to missing module)
3. Verify `monthlyCreditsReset` uses overwrite (`credits = creditsPerMonth`) — existing behavior is correct
4. Add plan-gate check in `deductCreditsServer` using `resolveEntitlement()` + `checkFeature()`
5. Add `ACTION_FEATURE_MAP` to `entitlements.ts`
6. Verify `reactivateSubscription` callable (already exists in index.ts)
7. Verify `cancelSubscription` reason/feedback fields (may already be wired)

### Phase 2: Frontend Foundation (CRITICAL — 1 missing file)
1. **CREATE** `src/hooks/useBillingState.ts` — Firestore real-time listener (imported by Billing.tsx but doesn't exist — frontend crashes)
2. Verify `'billing'` AppPhase in store
3. Verify billing nav link in header/sidebar
4. **Migrate** `InputForm.tsx` from `userData.plan`/`userData.credits` to `useBillingState()` (FR-015)

### Phase 3: Billing Page (components already scaffolded)
1. Verify `src/pages/Billing.tsx` renders correctly once useBillingState hook exists
2. Verify components work: `CreditBar`, `PlanCard`, `TopUpSelector`, `CancelDialog`, `PaymentFailedAlert`, `ReactivateButton`
3. Wire top-up flow (calls `createTopupCheckout`)
4. Wire cancellation flow (two-step dialog → `cancelSubscription`)
5. Wire reactivation (calls `reactivateSubscription`)
6. Wire "Manage subscription" button (calls `createStripePortalSession`)

### Phase 4: App-Wide Banners & Enforcement
1. Verify `TrialBanner` and `LowCreditsBanner` components exist and work
2. Add banners to `App.tsx` (rendered outside phase-specific content)
3. Implement downgrade enforcement — `useBillingState()` drives `canUse()` checks in real time
4. Handle `plan_downgraded` error in frontend credit-consuming actions

### Phase 5: Testing & Validation
1. Fix existing test fixtures for `buildBillingState()` (tests exist but fail due to missing module)
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
| Credit reset | Overwrite (credits = plan allocation) | Product decision — top-up credits do not carry over past reset |
| Grace period | Stripe-managed | No app-level configuration needed |
| Plan-gate check | Outside Firestore transaction | Entitlement reads are stable, avoid transaction scope bloat |
| Reactivation | Separate function (not toggle on cancel) | Semantic clarity |
