# Contract: Frontend Hooks, Components, and i18n Keys

**Branch**: `021-stripe-migration` | **Date**: 2026-05-05

## Hook: `useBillingState()`

**File**: `src/hooks/useBillingState.ts` (modified)
**Returns**: A real-time-listened snapshot of the user's `billingState` plus `useCanUse(action: string): boolean` helper.

### Shape

```typescript
type BillingState = {
  plan: 'starter' | 'pro' | 'scale' | 'none';
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: 'trialing' | 'active' | 'past_due' | 'cancelling' | 'cancelled' | 'none';
  nextResetDate: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  teamOwnerName: string | null;
  cancelAt: Date | null;
  gracePeriodEndsAt: Date | null;
  pendingPlan: string | null;
  pendingPlanEffectiveAt: Date | null;
};
```

### Removed fields (vs Phase 8)

- `paddleUpdatePaymentUrl`, `paddleCancelUrl` — never populated. Components that used to read these now call `createStripePortalSession` on demand instead.

### Subscription

Subscribes to `users/{uid}` document via Firestore `onSnapshot`. The hook re-derives `BillingState` on every server-driven change (Stripe webhook → `writeBillingState` → snapshot delivered to client). Performance target: < 3s end-to-end (SC-002).

### Team member behavior

When `isTeamMember === true`, the hook switches its listener to `users/{teamOwnerUid}` and overlays `isTeamMember: true` and `teamOwnerName` on the result. Team members see the owner's billing in read-only.

---

## Component: `<MandatoryBillingModal>`

**File**: `src/components/billing/MandatoryBillingModal.tsx` (modified)
**Visibility rule**: Render when `billingState.plan === 'none'` AND `!isTeamMember` AND no valid pending team invite. Listener-driven; auto-closes when `plan` transitions away from `'none'`.

### Behavior on plan-card click

```typescript
async function handleSelectPlan(priceId: string) {
  const fn = httpsCallable<{ priceId: string }, { checkoutUrl: string }>(
    functions,
    'createStripeCheckoutSession'
  );
  const { data } = await fn({ priceId });
  window.location.href = data.checkoutUrl;  // redirect to Stripe-hosted Checkout
}
```

The user is **never** redirected to GHL from this component (FR-024a, SC-018).

### Dismissibility

- No close button rendered
- `onClose={undefined}`
- Outside click ignored (`pointerDownOutside` event prevented)
- Escape key ignored (`onEscapeKeyDown={(e) => e.preventDefault()}`)

### Welcome toast trigger

After the modal closes (driven by listener detecting plan transition), a `useEffect` checks `users/{uid}.createdAt` (within 60s) AND `welcomeToastShown !== true`, fires the toast, and immediately writes `welcomeToastShown: true`.

---

## Component: `<PricingTable>`

**File**: `src/components/PricingTable.tsx` (modified)

### New: Monthly/Annual toggle

```tsx
<div className="flex justify-center mb-6">
  <button onClick={() => setBillingType('monthly')}>{t('billing.monthly')}</button>
  <button onClick={() => setBillingType('annual')}>{t('billing.annual')} <span className="text-green-500">{t('billing.annualSavings')}</span></button>
</div>
```

### Plan card click

Calls `createStripeCheckoutSession` with the appropriate price ID from `planconfig.ts`:

```typescript
const priceId = billingType === 'monthly'
  ? PLANS[planId].stripePriceId.monthly
  : PLANS[planId].stripePriceId.annual;
```

### Currency display

USD only (R-016). No currency selector. Prices rendered as `$29 / month`, `$290 / year (2 months free)`, etc.

---

## Component: `<TopUpSelector>`

**File**: `src/components/billing/TopUpSelector.tsx` (modified)

```typescript
async function handleTopUp(creditAmount: 100 | 300 | 800) {
  const priceId = TOPUP_PRICES[creditAmount];  // from planconfig.ts
  const fn = httpsCallable<
    { creditAmount: number; priceId: string },
    { checkoutUrl: string }
  >(functions, 'createStripeTopUpSession');
  const { data } = await fn({ creditAmount, priceId });
  window.location.href = data.checkoutUrl;
}
```

---

## Component: `<CancelDialog>`

**File**: `src/components/billing/CancelDialog.tsx` (modified)

### Two-step flow

1. **Step 1**: Confirmation + reason dropdown + optional feedback textarea. On submit, write `cancellation_logs/{uid}_{ts}` with the captured fields.
2. **Step 2**: Call `createStripePortalSession({ flow: 'subscription_cancel' })`, redirect to `portalUrl` in a new tab. The user completes cancellation on Stripe's hosted page; the resulting `customer.subscription.updated` webhook fires.

### After redirect

The dialog closes itself. The Billing page header updates via `useBillingState` listener when the webhook arrives (`billingStatus: 'cancelling'`, `cancelAt` populated).

---

## Component: `<PaymentFailedAlert>`

**File**: `src/components/billing/PaymentFailedAlert.tsx` (modified)

```typescript
async function handleUpdatePaymentMethod() {
  const fn = httpsCallable<
    { flow: 'payment_method_update' },
    { portalUrl: string }
  >(functions, 'createStripePortalSession');
  const { data } = await fn({ flow: 'payment_method_update' });
  window.open(data.portalUrl, '_blank');
}
```

The countdown to grace-period expiry uses `gracePeriodEndsAt` from `billingState`.

---

## Component: `<ReactivateButton>`

**File**: `src/components/billing/ReactivateButton.tsx` (modified)

For users with `billingStatus === 'cancelling'` who want to reactivate before period end, the button calls `createStripePortalSession()` (no flow deep-link) and opens the Stripe Customer Portal where the user can clear `cancel_at_period_end`.

---

## Component: `<PlanCard>`

**File**: `src/components/billing/PlanCard.tsx` (modified)

Reads `billingState.stripeCustomerId` and `billingState.stripeSubscriptionId` only for display debugging (in dev mode). Does not call Stripe APIs directly.

The "Manage Subscription" button calls `createStripePortalSession()`:

```typescript
async function handleManageSubscription() {
  const fn = httpsCallable<{}, { portalUrl: string }>(functions, 'createStripePortalSession');
  const { data } = await fn({});
  window.open(data.portalUrl, '_blank');
}
```

---

## Page: `<BillingPage>`

**File**: `src/pages/Billing.tsx` (modified)

URL query parameters handled on mount (cosmetic only — webhook is source of truth):

| Query | Behavior |
|---|---|
| `?paid=1` | Show success toast: "Subscription activated" |
| `?canceled=1` | No-op (user canceled the Checkout flow before paying) |
| `?topup=1` | Show success toast: "Credits added" (the actual credit add happens via webhook) |
| `?topup_canceled=1` | No-op |

URL params are consumed (cleared) after the toast fires.

---

## i18n Keys

**File**: `src/i18n.tsx` (modified)

All Phase 8 billing/auth keys are reused. Copy that mentioned "Paddle" is updated to generic terms or "Stripe". Keys list (en + ar):

### `billing.*`

- `billing.dashboard` — "Billing" / "الفواتير"
- `billing.currentPlan` — "Current plan" / "الخطة الحالية"
- `billing.creditsRemaining` — "Credits remaining" / "الرصيد المتبقي"
- `billing.nextReset` — "Next reset" / "الإعادة التالية"
- `billing.manageSubscription` — "Manage subscription" / "إدارة الاشتراك"
- `billing.cancelSubscription` — "Cancel subscription" / "إلغاء الاشتراك"
- `billing.updatePaymentMethod` — "Update payment method" / "تحديث طريقة الدفع"
- `billing.reactivate` — "Reactivate" / "إعادة تفعيل"
- `billing.upgrade` — "Upgrade" / "ترقية"
- `billing.topUp` — "Top up credits" / "شحن رصيد"
- `billing.monthly` — "Monthly" / "شهري"
- `billing.annual` — "Annual" / "سنوي"
- `billing.annualSavings` — "Save 2 months" / "وفّر شهرين"
- `billing.trialEnded` — "Your trial has ended — upgrade to keep generating." / "انتهت تجربتك — قم بالترقية للاستمرار."
- `billing.paymentFailed` — "Payment failed" / "فشل الدفع"
- `billing.gracePeriod` — "{days} days remaining to update your payment method" / "متبقي {days} يوم لتحديث طريقة الدفع"
- `billing.lowCredits` — "Credits running low" / "الرصيد ينفد"
- `billing.cancelledUntil` — "Cancelled — access until {date}" / "تم الإلغاء — الوصول حتى {date}"
- `billing.welcomeTrial` — "Welcome! Your 7-day trial has started." / "أهلاً! بدأت تجربتك المجانية لمدة 7 أيام."
- `billing.creditsAdded` — "{n} credits added to your account." / "تمت إضافة {n} رصيد لحسابك."
- `billing.subscriptionActivated` — "Subscription activated." / "تم تفعيل الاشتراك."
- `billing.refundProcessed` — "Refund processed." / "تم معالجة الاسترداد." (used if a `?refunded=1` query is added in a future iteration)

### `cancelDialog.*`

- `cancelDialog.title` — "Cancel subscription" / "إلغاء الاشتراك"
- `cancelDialog.confirmExplain` — "Your access will continue until {date}." / "سيستمر وصولك حتى {date}."
- `cancelDialog.reasonLabel` — "Why are you cancelling?" / "لماذا تلغي؟"
- `cancelDialog.reasonOptions.too_expensive` — "Too expensive"
- `cancelDialog.reasonOptions.not_using_enough` — "Not using enough"
- `cancelDialog.reasonOptions.switching_competitor` — "Switching to another tool"
- `cancelDialog.reasonOptions.missing_features` — "Missing features"
- `cancelDialog.reasonOptions.other` — "Other"
- `cancelDialog.feedbackLabel` — "Anything we should know? (optional)"
- `cancelDialog.continue` — "Continue to Stripe to confirm" / "أكمل في Stripe للتأكيد"

### `login.*` (UNCHANGED from Phase 8)

`login.tabLogin`, `login.tabCreate`, `login.email`, `login.password`, `login.confirmPassword`, `login.submit`, `login.forgotPassword`, `login.errorUnknownEmail`, `login.errorEmailExists`, `login.errorPasswordsDontMatch`, `login.errorPasswordTooShort`, `login.verifyEmailTitle`, `login.verifyEmailBody`, `login.resendVerification`, `login.resetPasswordSent`

### `auth.*` (UNCHANGED from Phase 8)

`auth.welcome`, `auth.signOut`

---

## Plan Configuration

**File**: `src/planconfig.ts` (modified)

```typescript
export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    creditsPerMonth: 500,
    stripePriceId: {
      monthly: 'price_xxxxxxxxxxxxxx',  // assigned during Stripe Dashboard setup (Phase 21.A.2)
      annual: 'price_xxxxxxxxxxxxxx',
    },
    // ... other plan fields unchanged from Phase 8
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    creditsPerMonth: 2000,
    stripePriceId: {
      monthly: 'price_xxxxxxxxxxxxxx',
      annual: 'price_xxxxxxxxxxxxxx',
    },
    // ...
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    creditsPerMonth: 8000,
    stripePriceId: {
      monthly: 'price_xxxxxxxxxxxxxx',
      annual: 'price_xxxxxxxxxxxxxx',
    },
    // ...
  },
};

export const TOPUP_PRICES = {
  100: 'price_xxxxxxxxxxxxxx',  // 100-credit pack
  300: 'price_xxxxxxxxxxxxxx',  // 300-credit pack
  800: 'price_xxxxxxxxxxxxxx',  // 800-credit pack
};

// Mirror of functions/src/stripe/stripeClient.ts STRIPE_PRICE_TO_PLAN
// Single source of truth lives in the backend file; this is a derived const for frontend use.
export const STRIPE_PRICE_TO_PLAN: Record<string, { plan: keyof typeof PLANS; billingType: 'monthly' | 'annual' }> = {
  // populated at module load by iterating PLANS
};
```

Removed (vs Phase 8): `paddlePriceId`, `paddleTopUpPriceIds`.

---

## App Shell Changes

**File**: `src/App.tsx` (modified)

- Drop `Paddle.Setup({...})` initialization in app init
- Drop `<PaddleScript />` if any (it was loaded via `index.html` only — drop the script tag too)
- `onAuthStateChanged` flow unchanged: pending plan consume → mandatory modal OR welcome path
- The `MandatoryBillingModal` CTA wiring is updated per the modal contract above

**File**: `index.html` (modified)

Drop:
```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js" defer></script>
```

No replacement script needed. Stripe Checkout Sessions and Customer Portal both work via server-side session creation + browser redirect — no client-side `Stripe()` global needed.
