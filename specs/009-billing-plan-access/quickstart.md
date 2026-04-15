# Quickstart: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14

## Prerequisites

- Node.js 18+ (Firebase Cloud Functions v2 requirement)
- Firebase CLI (`npm install -g firebase-tools`)
- Paddle sandbox account with products/prices configured per LAUNCH_MATRIX 8.A
- GHL account with the two inbound webhook workflows configured per LAUNCH_MATRIX 8.B

## Owner Setup Steps (Manual, Before Any Code)

These map to LAUNCH_MATRIX tasks 8.A and 8.B. Complete them before implementation.

### Paddle Dashboard (8.A)

1. **8.A.1**: Create a Paddle Billing account, complete business verification, switch to Sandbox mode.
2. **8.A.2**: Create 4 subscription products in Paddle: Starter ($19/mo), Creator ($39/mo), Pro ($79/mo), Scaling ($179/mo). Note each Price ID (`pri_xxxxx`).
3. **8.A.3**: Create the one-time "Credit Top-Up" product with 3 prices (100 / 300 / 800 credits). Note each Price ID.
4. **8.A.4**: Generate a Paddle API key → save as `PADDLE_API_KEY`.
5. **8.A.5**: Create a Paddle Notification destination (Webhook) pointing to `https://europe-west1-proadsai-saas.cloudfunctions.net/paddleWebhook`. Subscribe to these 6 events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `transaction.completed`, `transaction.payment_failed`. Save the webhook secret as `PADDLE_WEBHOOK_SECRET`.
6. **8.A.6**: Use the Paddle Webhook Simulator to verify the URL is reachable (404 before deployment is fine).

### GHL Setup (8.B)

1. **8.B.1**: Create the "Paddle Payment Received" workflow with Inbound Webhook trigger. Save the URL as `GHL_PADDLE_SYNC_WEBHOOK_URL`.
2. **8.B.2**: Add actions: Update Contact (set `plan`, `billing_status`, tag `paid_{{plan}}`), If/Else for `subscription.created` → Welcome Email, If/Else for `subscription.canceled` → Win-Back.
3. **8.B.3**: Create the "Paddle Payment Failed" workflow with a separate inbound webhook. Save the URL as `GHL_PADDLE_FAILED_WEBHOOK_URL`. Add Update Contact (set `billing_status: past_due`) and Dunning Email action.
4. **8.B.4**: Update GHL funnel CTA buttons to point at Paddle checkout URLs with the correct price ID. **Do NOT include `firebaseUid`** — new users coming from the funnel don't have one; the webhook handler will write to `pending_plans/{email}`.

### Firebase Secrets

```bash
firebase functions:secrets:set PADDLE_API_KEY
firebase functions:secrets:set PADDLE_WEBHOOK_SECRET
firebase functions:secrets:set GHL_PADDLE_SYNC_WEBHOOK_URL
firebase functions:secrets:set GHL_PADDLE_FAILED_WEBHOOK_URL
# Verify:
firebase functions:secrets:access PADDLE_API_KEY
```

Keep `GHL_TEAM_INVITE_WEBHOOK_URL` for Phase 9.

## Code Setup

### 1. Install Dependencies

```bash
cd functions
npm install @paddle/paddle-node-sdk
npm uninstall stripe  # OR keep for reference; remove from active imports only
```

### 2. Add Paddle.js to Frontend

In `index.html`:

```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
```

In `src/main.tsx` or app init:

```typescript
Paddle.Setup({ token: PADDLE_CLIENT_TOKEN });
if (import.meta.env.DEV) Paddle.Environment.set('sandbox');
```

### 3. Configure Plan Price IDs

In `src/planconfig.ts`:

```typescript
starter: { ..., paddlePriceId: 'pri_xxx_starter' }
creator: { ..., paddlePriceId: 'pri_xxx_creator' }
pro:     { ..., paddlePriceId: 'pri_xxx_pro' }
scaling: { ..., paddlePriceId: 'pri_xxx_scaling' }
paddleTopUpPriceIds: { 100: 'pri_xxx', 300: 'pri_xxx', 800: 'pri_xxx' }
```

Mirror on backend in `functions/src/index.ts` as `PADDLE_PRICE_TO_PLAN`.

## Development Workflow

```bash
# Frontend dev server
npm run dev

# Backend emulator
cd functions && npm run serve

# Backend tests
cd functions && npm test

# Deploy functions only
firebase deploy --only functions

# Deploy everything
firebase deploy
```

## Testing Paddle Webhooks

Use Paddle's Webhook Simulator from the dashboard to send test events. Or run the Firebase emulator and curl the webhook endpoint with a valid signed payload (see `billingState.test.ts` for fixtures).

## Key Files to Modify

### Backend (functions/src/)

- `index.ts` — Add Paddle secret refs, `paddleWebhook` export, `createPaddleCheckout` and `createPaddleTopUp` callables. Remove Stripe imports, `createStripePortalSession`, `ghlpaymentwebhook`, `ghlCancellationWebhook`, `ghlPaymentFailedWebhook`, `stripeWebhook`.
- `billing/billingState.ts` — Update `writeBillingState()` with Paddle fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`). Add idempotency helpers (`isEventProcessed`, `markEventProcessed`).
- `billing/paddleWebhook.ts` — NEW. `handlePaddleWebhook()` with signature verification, idempotency, dual-write logic, and GHL notification calls.
- `billing/ghlBillingSync.ts` — NEW. `notifyGHL(identifier, event)` and `notifyGHLFailed(identifier, event)`, both fire-and-forget.
- `entitlements.ts` — Add `ACTION_FEATURE_MAP` export.
- `billing/__tests__/billingState.test.ts` — Rewrite 6 scenarios for Paddle (see 8.C.15).

### Frontend (src/)

- `firebase.ts` — Remove `GoogleAuthProvider` and `googleProvider` export.
- `App.tsx` — Refactor LoginScreen into Login / Create Account tabs, remove `handleGoogleLogin` and all Google UI, add `handleCreateAccount` with email verification gate, update `onAuthStateChanged` to: (a) route unverified to VerifyEmailScreen, (b) consume `pending_plans/{email}` on first login, (c) KEEP unpaid accounts (do not delete) and show `MandatoryBillingModal`, (d) show welcome toast only if `createdAt` within 60s.
- `components/auth/VerifyEmailScreen.tsx` — NEW.
- `components/auth/ForgotPasswordDialog.tsx` — NEW.
- `components/billing/MandatoryBillingModal.tsx` — NEW (dismiss-proof).
- `components/billing/CreditBar.tsx`, `PlanCard.tsx`, `TopUpSelector.tsx`, `ReactivateButton.tsx`, `PaymentFailedAlert.tsx`, `TrialExpiredBanner.tsx`, `LowCreditsWarning.tsx` — NEW components for the Billing page.
- `components/billing/CancelDialog.tsx` — Existing, ensure it records the reason to `cancellation_logs` and opens `paddleCancelUrl` on submit.
- `components/PricingTable.tsx` — Update CTA buttons to call `createPaddleCheckout(paddlePriceId)`.
- `hooks/useBillingState.ts` — Real-time listener + `useCanUse` hook.
- `pages/Billing.tsx` — Assemble sections using `useBillingState`, call Paddle URLs directly for management actions.
- `i18n.tsx` — Add all `billing.*` and `login.*` keys (en + ar).
- `planconfig.ts` — Add `paddlePriceId` per plan and `paddleTopUpPriceIds`. Remove Stripe price IDs.

### Config

- `functions/package.json` — Add `@paddle/paddle-node-sdk`.
- `index.html` — Add Paddle.js script tag.

## Manual Validation Checklist (Post-Deploy)

1. Pay on Paddle via GHL funnel WITHOUT firebaseUid → verify `pending_plans/{email}` written, GHL sync hits sync webhook
2. Create Firebase Auth account with same email → verify pending plan consumed, `users/{uid}` created, welcome toast shown (within 60s)
3. Create Firebase Auth account with a fresh email (no pending plan) → verify verification email sent, VerifyEmailScreen shown
4. Click verification link → return to app → mandatory billing modal shown (dismiss-proof)
5. Complete Paddle checkout from modal → verify modal auto-closes, welcome toast fires
6. Trigger `transaction.completed` with `isTopUp: true` → credits added
7. Trigger `subscription.past_due` → billingStatus past_due, GHL dunning sync fires
8. Trigger `subscription.canceled` → plan=none, credits=0, GHL win-back sync fires
9. Verify login screen shows NO Google button, NO Google-related UI
10. Verify RTL layout on billing page and auth screens with Arabic locale
11. Check Cloud Functions logs — every webhook produces a structured log entry with event ID, type, and result
