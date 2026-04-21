# Contract: Frontend Billing & Auth Hooks and Components

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14

## Hook: `useBillingState()`

**Location**: `src/hooks/useBillingState.ts`  
**Purpose**: Real-time subscription to `users/{uid}.billingState` via Firestore listener

### Return Type

```typescript
interface UseBillingStateReturn {
  billingState: BillingState | null;
  loading: boolean;
  error: Error | null;
}

interface BillingState {
  plan: 'starter' | 'creator' | 'pro' | 'scaling' | 'none';
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: 'active' | 'past_due' | 'cancelled' | 'cancelling' | 'trialing';
  nextResetDate?: Date;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  paddleUpdatePaymentUrl?: string;
  paddleCancelUrl?: string;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid?: string;
  teamOwnerName?: string;
  cancelAt?: Date;
  gracePeriodEndsAt?: Date;
  pendingPlan?: string;
  pendingPlanEffectiveAt?: Date;
}
```

### Behavior

- Subscribes to `users/{uid}` document on mount
- Extracts `billingState` sub-field
- Unsubscribes on unmount
- Returns `loading: true` until first snapshot
- Emits Firestore listener errors via `error`

---

## Hook: `useCanUse(feature: GatedFeature)`

**Location**: `src/hooks/useBillingState.ts` (co-located)  
**Purpose**: Frontend feature-gate check using billing state

### Return Type

```typescript
interface UseCanUseReturn {
  allowed: boolean;
  requiredPlan?: string;
}
```

**Note**: This is a UI hint only. Server-side `deductCreditsServer` is the authoritative gate.

---

## Component: `LoginScreen` (refactored)

**Location**: `src/App.tsx` (existing inline component)  
**Purpose**: Email-only authentication with Login / Create Account tabs

### State

```typescript
interface LoginScreenState {
  activeTab: 'login' | 'create';
  pendingEmail: string;  // Cross-tab pre-fill on auto-switch
  inlineError: string | null;
}
```

### Behaviors

- Login tab: email + password + ENTER STUDIO button + Forgot Password link + "Don't have an account? Create one" link
- Create Account tab: email + password + confirm password + CREATE ACCOUNT button + "Already have an account? Log in" link (no forgot password)
- Tab switching is state-only (no route change)
- Auto-switch on collision: `auth/email-already-in-use` → switch to Login with email pre-filled; `auth/user-not-found` → switch to Create Account with email pre-filled
- ZERO Google sign-in UI, provider, or handlers

---

## Component: `VerifyEmailScreen` (new)

**Location**: `src/components/auth/VerifyEmailScreen.tsx`  
**Purpose**: Post-account-creation gate blocking app access until email is verified

### Props

```typescript
interface VerifyEmailScreenProps {
  email: string;
  onResend: () => Promise<void>;  // Calls sendEmailVerification again
  onCheckVerified: () => Promise<void>;  // Calls user.reload() and re-checks emailVerified
  onSignOut: () => Promise<void>;
}
```

### Behavior

- Shows "We sent a verification link to [email]"
- "Resend verification email" button (rate-limited client-side to prevent spam)
- "I've verified — continue" button that calls `user.reload()` and routes forward if `emailVerified`
- Sign out button
- This screen is shown whenever the authenticated user's `emailVerified === false`, regardless of billing state

---

## Component: `ForgotPasswordDialog` (new)

**Location**: `src/components/auth/ForgotPasswordDialog.tsx`  
**Purpose**: Wraps Firebase `sendPasswordResetEmail` with a non-revealing confirmation

### Behavior

- Prompts for email
- Calls `sendPasswordResetEmail(auth, email)`
- Shows the same confirmation message regardless of whether the account exists: "If an account exists for this email, a reset link has been sent."
- Firebase hosts the actual reset page — no custom in-app reset UI

---

## Component: `MandatoryBillingModal` (new)

**Location**: `src/components/billing/MandatoryBillingModal.tsx`  
**Purpose**: Dismiss-proof fullscreen pricing modal for unpaid authenticated users

### Props

None — reads from `useBillingState()`.

### Behavior

- Renders whenever `billingState.plan === 'none'` AND `!billingState.isTeamMember` AND no valid pending team invite for user's email
- Contains `<PricingTable />` with CTA buttons calling `createPaddleCheckout(paddlePriceId)`
- NO close button
- Does NOT respond to outside clicks
- Does NOT respond to the escape key
- Uses a `useEffect` to watch `billingState.plan`: when it transitions from `'none'` to a real plan, closes and fires the welcome toast
- Supports RTL layout

---

## Component: Billing Page (`src/pages/Billing.tsx`)

### Sections (conditional rendering)

| Section | Condition | Content |
|---|---|---|
| Plan Card | Always | Plan name, billing type, credits bar, next reset date |
| Trial Banner | `isTrial && credits > 0` | Trial status with upgrade CTA |
| Trial Expired Banner | `isTrial && credits === 0` | "Trial ended" with upgrade CTA (persistent app-wide banner) |
| Payment Failed Alert | `billingStatus === 'past_due'` | Alert + "Update payment method" button (opens `paddleUpdatePaymentUrl`) + grace period countdown |
| Cancelled Notice | `billingStatus === 'cancelling'` | "Cancelled — access until [cancelAt]" + reactivate button (opens Paddle management portal) |
| Pending Downgrade Notice | `pendingPlan && pendingPlanEffectiveAt` | "Your plan will change to [pendingPlan] on [date]" |
| Upgrade CTA | `canUpgrade` | Button calling `createPaddleCheckout` for next tier |
| Top-Up Options | `canTopUp` | 3 packs (100 / 300 / 800 credits) calling `createPaddleTopUp` |
| Manage Subscription | `paddleUpdatePaymentUrl && !isTeamMember` | "Update Payment Method" button opening `paddleUpdatePaymentUrl` |
| Cancel Button | `billingStatus === 'active' && !isTeamMember` | Opens CancelDialog; on submit, records reason + opens `paddleCancelUrl` |
| Team Read-Only | `isTeamMember` | "Team credits — [teamOwnerName]'s account" label |
| Low Credits Warning | `credits < creditsPerMonth * 0.2 && credits > 0` | Banner with top-up CTA |

---

## i18n Keys (en + ar)

### Billing keys

```
billing.title
billing.planCard.plan
billing.planCard.credits
billing.planCard.nextReset
billing.planCard.billingType
billing.trial.active
billing.trial.expired
billing.trial.upgradeCta
billing.paymentFailed.title
billing.paymentFailed.updateMethod
billing.paymentFailed.graceCountdown
billing.cancelled.title
billing.cancelled.accessUntil
billing.cancelled.reactivate
billing.pendingDowngrade.notice
billing.upgrade.cta
billing.topup.title
billing.topup.pack100
billing.topup.pack300
billing.topup.pack800
billing.topup.success
billing.manage.title
billing.manage.updatePayment
billing.cancel.button
billing.cancel.confirm
billing.cancel.periodEnd
billing.cancel.reasonLabel
billing.cancel.feedbackLabel
billing.cancel.submit
billing.cancel.reasons.too_expensive
billing.cancel.reasons.not_using_enough
billing.cancel.reasons.switching_competitor
billing.cancel.reasons.missing_features
billing.cancel.reasons.other
billing.team.readOnly
billing.team.ownerLabel
billing.lowCredits.warning
billing.lowCredits.topupCta
billing.error.planDowngraded
billing.error.trialExpired
billing.error.unknown
billing.reactivated
billing.mandatoryModal.title
billing.mandatoryModal.subtitle
```

### Auth keys

```
login.title
login.emailLabel
login.passwordLabel
login.enterStudio
login.forgotPassword
login.dontHaveAccount
login.alreadyHaveAccount
login.createAccount
login.createAccountButton
login.confirmPasswordLabel
login.errorEmailInUse
login.errorUserNotFound
login.errorWrongPassword
login.errorTooManyRequests
login.errorWeakPassword
login.errorInvalidEmail
login.errorPasswordsMismatch
login.errorGeneric
login.welcomeTrial
login.forgotPasswordDialog.title
login.forgotPasswordDialog.emailPrompt
login.forgotPasswordDialog.submit
login.forgotPasswordDialog.confirmation
login.verifyEmail.title
login.verifyEmail.subtitle
login.verifyEmail.resend
login.verifyEmail.checkVerified
login.verifyEmail.resent
login.verifyEmail.signOut
```

All keys must have matching `en` and `ar` translations. No hardcoded strings in the billing or auth UI.
