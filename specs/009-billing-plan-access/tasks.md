# Tasks: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Input**: Design documents from `/specs/009-billing-plan-access/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are not included by default. The existing `functions/src/billing/__tests__/billingState.test.ts` is rewritten in the Polish phase per LAUNCH_MATRIX 8.C.15.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Paddle dependencies, configure secrets, establish price mappings, load Paddle.js

- [x] T001 Add `@paddle/paddle-node-sdk` dependency to functions/package.json and run `npm install` in the functions/ directory
- [x] T002 [P] Add Paddle.js script tag (`<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>`) to index.html and initialize via `Paddle.Setup({ token: PADDLE_CLIENT_TOKEN })` with `Paddle.Environment.set('sandbox')` in dev mode, wired into src/main.tsx
- [x] T003 [P] Declare Firebase secret references in functions/src/index.ts using `defineSecret`: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `GHL_PADDLE_SYNC_WEBHOOK_URL`, `GHL_PADDLE_FAILED_WEBHOOK_URL`. Keep `GHL_TEAM_INVITE_WEBHOOK_URL` for Phase 9.
- [x] T004 [P] Create PADDLE_PRICE_TO_PLAN mapping (Paddle price ID -> { plan, credits }) and PADDLE_TOPUP_PRICES mapping (packId -> { priceId, credits }) as module-level constants in functions/src/index.ts. Price IDs come from Paddle dashboard setup (LAUNCH_MATRIX 8.A.2 and 8.A.3).
- [x] T005 [P] Add `paddlePriceId` field to each plan entry in src/planconfig.ts (starter, creator, pro, scaling) and add `paddleTopUpPriceIds: { 100, 300, 800 }`. Remove Stripe price ID references from active code (keep commented for reference).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core billing state infrastructure, Paddle webhook plumbing, idempotency, GHL sync helpers, structured logging, frontend hooks, i18n — everything every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Implement `buildBillingState(userData)` function in functions/src/billing/billingState.ts — accepts user document fields and returns the derived BillingState object per data-model.md shape (plan, isTrial, credits, creditsPerMonth, billingStatus, nextResetDate, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, canUpgrade, canTopUp, isTeamMember, teamOwnerUid, teamOwnerName, cancelAt, gracePeriodEndsAt, pendingPlan, pendingPlanEffectiveAt)
- [x] T007 Implement `writeBillingState(uid)` function in functions/src/billing/billingState.ts — reads user doc, calls `buildBillingState()`, atomically writes result to `users/{uid}.billingState` via Firestore transaction
- [x] T008 Implement idempotency helpers `isEventProcessed(eventId)` and `markEventProcessed(eventId, eventType, metadata)` in functions/src/billing/billingState.ts — reads/writes `paddle_events/{eventId}` collection with fields { eventType, processedAt, paddleCustomerId, paddleSubscriptionId, email, result }
- [x] T009 Implement structured logging helper `logBillingStep(step, eventId, status, errorCode?, extra?)` in functions/src/billing/billingLogger.ts (NEW file) — emits a structured log entry with fields { step, eventId, eventType, userId?, email?, status, errorCode?, durationMs }. Define the fixed error code vocabulary: `paddle_signature_invalid`, `paddle_event_duplicate`, `paddle_event_unknown`, `paddle_price_unmapped`, `ghl_sync_failed`, `user_doc_missing`, `pending_plan_write_failed`, `billing_state_write_failed`
- [x] T010 [P] Create functions/src/billing/ghlBillingSync.ts with `notifyGHL(identifier, event)` that accepts either a Firebase uid (reads users/{uid} for email/displayName) OR a raw email string (for pending_plans users). POSTs fire-and-forget to `GHL_PADDLE_SYNC_WEBHOOK_URL` with payload `{ email, contactName, plan, billingStatus, event, credits, paddleSubscriptionId, updatePaymentUrl }`. Errors are logged via `logBillingStep(..., 'ghl_sync_failed')` but NEVER thrown.
- [x] T011 [P] Add `notifyGHLFailed(identifier, event)` to functions/src/billing/ghlBillingSync.ts — accepts uid or email, POSTs fire-and-forget to `GHL_PADDLE_FAILED_WEBHOOK_URL` with payload `{ email, contactName, event, updatePaymentUrl }`. Same fire-and-forget semantics as `notifyGHL`.
- [x] T012 Create functions/src/billing/paddleWebhook.ts with `handlePaddleWebhook(req, res)` stub — reads `req.rawBody` (NOT `req.body`), verifies signature via `paddle.webhooks.unmarshal(rawBody, secret, signature)`, logs step `webhook_received` + `signature_verified`, checks idempotency via `isEventProcessed()`, logs duplicates as `paddle_event_duplicate`, routes by `event.eventType` with a switch statement containing empty handlers for the 6 supported events, marks event processed, returns 200. Signature failure returns 400 with `paddle_signature_invalid` log.
- [x] T013 Export `paddleWebhook` as `onRequest` HTTP function in functions/src/index.ts with `{ cors: true, secrets: [paddleApiKey, paddleWebhookSecret, ghlPaddleSyncUrl, ghlPaddleFailedUrl], region: 'europe-west1' }`. Remove active exports of `ghlpaymentwebhook`, `ghlCancellationWebhook`, `ghlPaymentFailedWebhook`, `createStripePortalSession`, `stripeWebhook`, and the old `createTopupCheckout` (Stripe version). Remove Stripe imports. Keep `ghlTeamInviteUrl` secret for Phase 9.
- [x] T014 [P] Wire `writeBillingState()` call into `monthlyCreditsReset` handler in functions/src/index.ts after each user's credits are reset (per LAUNCH_MATRIX 8.C.16). Verify scheduled function still reads plan from user doc and resets credits to plan allotment.
- [x] T015 [P] Implement `useBillingState()` hook in src/hooks/useBillingState.ts — subscribes to `users/{uid}` document via Firestore `onSnapshot`, extracts `billingState` sub-field, returns `{ billingState, loading, error }`, unsubscribes on unmount. Handles missing document case (returns `billingState: null`).
- [x] T016 [P] Add `useCanUse(feature)` hook to src/hooks/useBillingState.ts (co-located) — reads plan from `useBillingState()`, checks against PLAN_FEATURES mirror in src/planconfig.ts, returns `{ allowed, requiredPlan }`. This is a UI hint — server-side `deductCreditsServer` remains the authoritative gate.
- [x] T017 [P] Add `ACTION_FEATURE_MAP` export to functions/src/entitlements.ts — maps credit-consuming action names from the COSTS map (e.g., `generateHooks`, `generateCarouselCopies`, `competitorResearch`, `brandUrlScraping`, etc.) to their required GatedFeature (or `null` for always-allowed actions)
- [x] T018 [P] Add all `billing.*` i18n keys to src/i18n.tsx with both en and ar translations per the key list in contracts/frontend-hooks.md. Cover plan card, trial, payment failure, cancelled, pending downgrade, upgrade, top-up, manage, cancel (including reasons), team read-only, low credits, errors, mandatory modal.
- [x] T019 [P] Add all `login.*` i18n keys to src/i18n.tsx with both en and ar translations per contracts/frontend-hooks.md. Cover login labels, create account, forgot password dialog, verify email screen, welcome trial toast, and all auth error messages.
- [x] T020 [P] Register `/billing` route in src/App.tsx pointing to src/pages/Billing.tsx

**Checkpoint**: Foundation ready — Paddle webhook endpoint is live (stub handlers), idempotency + signature verification + structured logging are in place, GHL sync helpers exist, frontend hook + i18n + route are ready. All user story work can now begin.

---

## Phase 3: User Story 2 — Unified Billing State via Paddle Webhooks (Priority: P1) 🎯 MVP CORE

**Goal**: Every Paddle webhook type updates the user's `billingState` atomically. The webhook handler routes by event type, applies the correct state changes, and supports the dual-write pattern (users/{uid} vs pending_plans/{email}).

**Independent Test**: Send each of the 6 Paddle event types via the Paddle webhook simulator (subscription.created with and without firebaseUid, subscription.updated, subscription.canceled, subscription.past_due, transaction.completed with isTopUp, transaction.payment_failed). Verify the resulting user doc or pending_plans doc has the correct fields, `billingState` is written, and structured logs show the full pipeline.

### Implementation for User Story 2

- [x] T021 [US2] Implement `subscription.created` handler inside functions/src/billing/paddleWebhook.ts — extract `event.data.customData.firebaseUid` and `event.data.customer.email`. Map `event.data.items[0].price.id` to plan name via PADDLE_PRICE_TO_PLAN (log `paddle_price_unmapped` and abort on unknown price). Compute plan fields: plan, credits (from planconfig), paddleSubscriptionId (event.data.id), paddleCustomerId (event.data.customerId), billingStatus 'active', paddleUpdatePaymentUrl (event.data.managementUrls.updatePaymentMethod), paddleCancelUrl (event.data.managementUrls.cancel), isTrial (from trial period flag). **Dual-write**: if firebaseUid present, update `users/{uid}` and call `writeBillingState(uid)`; if missing, overwrite (last-write-wins) `pending_plans/{email.toLowerCase()}` with the same plan fields plus `sourceEventId`. Log structured steps throughout.
- [x] T022 [US2] Implement `subscription.updated` handler inside functions/src/billing/paddleWebhook.ts — locate user by paddleSubscriptionId (query `users` where `paddleSubscriptionId == event.data.id`, log `user_doc_missing` if not found). Compare new price ID to existing plan: if different, map via PADDLE_PRICE_TO_PLAN and update plan + credits. Always refresh `paddleUpdatePaymentUrl` and `paddleCancelUrl` from event.data.managementUrls. Call `writeBillingState(uid)`.
- [x] T023 [US2] Implement `subscription.canceled` handler inside functions/src/billing/paddleWebhook.ts — locate user by paddleSubscriptionId. Set plan='none', billingStatus='cancelled', credits=0, cancelledAt=now. Call `writeBillingState(uid)`.
- [x] T024 [US2] Implement `subscription.past_due` handler inside functions/src/billing/paddleWebhook.ts — locate user by paddleSubscriptionId. Set billingStatus='past_due', billingIssueAt=now, gracePeriodEndsAt=now+2days. Do NOT zero credits. Call `writeBillingState(uid)`.
- [x] T025 [US2] Implement `transaction.completed` handler inside functions/src/billing/paddleWebhook.ts — check `event.data.customData.isTopUp === true`. If yes: extract `customData.firebaseUid` and `customData.creditAmount`, run a Firestore transaction to add `creditAmount` to `users/{uid}.credits`, set lastTopup and lastTopupPack, call `writeBillingState(uid)`. If not a top-up: log step as `ignored` (subscription transactions are handled by subscription events) and return.
- [x] T026 [US2] Implement `transaction.payment_failed` handler inside functions/src/billing/paddleWebhook.ts — locate user by customerId. Set billingStatus='past_due', billingIssueAt=now, gracePeriodEndsAt=now+2days (if not already set). Call `writeBillingState(uid)`.

**Checkpoint**: All 6 Paddle event types produce correct billing state changes. Dual-write works for pre-signup users. Structured logs cover every step.

---

## Phase 4: User Story 12 — Firebase-to-GHL Sync (Priority: P1)

**Goal**: Every successful Paddle webhook triggers a fire-and-forget sync POST to GHL. Success events go to the sync webhook; past_due and payment_failed go to the dunning webhook. Failures are logged but never block billing.

**Independent Test**: For each Paddle event type, verify the corresponding GHL inbound webhook URL receives the correct payload. Break the GHL URL (use a bad URL) and verify the billing state update still succeeds with a logged failure.

### Implementation for User Story 12

- [x] T027 [US12] Wire `notifyGHL` call into the `subscription.created` handler in functions/src/billing/paddleWebhook.ts — pass uid for logged-in path and email for pending_plans path
- [x] T028 [P] [US12] Wire `notifyGHL` call into the `subscription.updated` handler in functions/src/billing/paddleWebhook.ts
- [x] T029 [P] [US12] Wire `notifyGHL` call into the `subscription.canceled` handler in functions/src/billing/paddleWebhook.ts
- [x] T030 [P] [US12] Wire `notifyGHLFailed` call into the `subscription.past_due` handler in functions/src/billing/paddleWebhook.ts
- [x] T031 [P] [US12] Wire `notifyGHL` call into the `transaction.completed` handler (for top-ups) in functions/src/billing/paddleWebhook.ts — pass event 'topup'
- [x] T032 [P] [US12] Wire `notifyGHLFailed` call into the `transaction.payment_failed` handler in functions/src/billing/paddleWebhook.ts

**Checkpoint**: Every Paddle webhook triggers a GHL sync attempt that is logged regardless of outcome.

---

## Phase 5: User Story 13 — Email-Only Authentication (Priority: P1)

**Goal**: Login screen has Login and Create Account tabs only. Google sign-in is completely removed. Auto-switching on email collisions with cross-tab pre-fill. Forgot Password uses Firebase built-in.

**Independent Test**: Open login screen → verify zero Google UI. Log in with an existing account. Create a new account with a fresh email. Enter an unknown email on Login → verify auto-switch to Create Account with email pre-filled. Enter an existing email on Create Account → verify auto-switch to Login with email pre-filled. Click Forgot Password → enter email → verify Firebase reset email sent.

### Implementation for User Story 13

- [x] T033 [US13] Remove `GoogleAuthProvider` import and `export const googleProvider` line from src/firebase.ts
- [x] T034 [US13] Remove `googleProvider` import and `signInWithPopup` import from src/App.tsx. Add `createUserWithEmailAndPassword`, `sendEmailVerification`, `sendPasswordResetEmail` to the `firebase/auth` import.
- [x] T035 [US13] Delete `handleGoogleLogin` function from src/App.tsx. Remove `onGoogleLogin` prop from LoginScreen component definition and from the `<LoginScreen>` render call. Remove `noAccountError` state and its Google-specific error UI.
- [x] T036 [US13] Refactor LoginScreen component in src/App.tsx: add `activeTab` state (`'login' | 'create'`), add `pendingEmail` state for cross-tab pre-fill, render two tab buttons above the form, highlight the active tab, use state toggle (no route change). Initial tab = 'login'.
- [x] T037 [US13] Implement Login tab UI in src/App.tsx: Email + Password fields, ENTER STUDIO button calling `handleEmailLogin`, "Forgot Password?" link opening ForgotPasswordDialog, "Don't have an account? Create one" link switching to Create Account tab. NO Google button, NO divider, NO separator. Pre-fill email from `pendingEmail` state when present.
- [x] T038 [US13] Implement Create Account tab UI in src/App.tsx: Email + Password + Confirm Password fields, CREATE ACCOUNT button calling `handleCreateAccount`, "Already have an account? Log in" link switching to Login tab. NO "Forgot Password?" link. Pre-fill email from `pendingEmail` state when present.
- [x] T039 [US13] Add `handleCreateAccount` function in src/App.tsx: validate `password === confirmPassword` (show inline "Passwords don't match" on failure via `login.errorPasswordsMismatch`), validate `password.length >= 8` (show `login.errorWeakPassword`), call `createUserWithEmailAndPassword(auth, email, password)`. On success, the `onAuthStateChanged` handler (implemented in US14) takes over.
- [x] T040 [US13] Add error handling to `handleCreateAccount` in src/App.tsx: `auth/email-already-in-use` → show `login.errorEmailInUse` AND set `pendingEmail` to the entered email AND switch `activeTab` to 'login'; `auth/weak-password` → `login.errorWeakPassword`; `auth/invalid-email` → `login.errorInvalidEmail`; other → `login.errorGeneric`.
- [x] T041 [US13] Update `handleEmailLogin` error handling in src/App.tsx: `auth/user-not-found` → show `login.errorUserNotFound` AND set `pendingEmail` AND switch `activeTab` to 'create'; `auth/wrong-password` → `login.errorWrongPassword`; `auth/too-many-requests` → `login.errorTooManyRequests`.
- [x] T042 [P] [US13] Create src/components/auth/ForgotPasswordDialog.tsx — modal dialog prompting for email, calls `sendPasswordResetEmail(auth, email)` on submit, shows the non-revealing confirmation message `login.forgotPasswordDialog.confirmation` regardless of whether account exists, supports RTL, uses i18n keys.
- [x] T043 [US13] Wire ForgotPasswordDialog into src/App.tsx — "Forgot Password?" link on the Login tab opens the dialog; dialog closes on confirmation.
- [x] T044 [US13] Verify zero Google sign-in references remain in src/App.tsx, src/firebase.ts, and any auth-related components. Code audit for `googleProvider`, `signInWithPopup`, `GoogleAuthProvider`, Google icons, Google buttons.

**Checkpoint**: Login screen is email-only with Login/Create Account tabs, auto-switching works, Forgot Password works. No Google sign-in remains.

---

## Phase 6: User Story 14 — Post-Payment Account Creation, Email Verification, Pending Plans, and Mandatory Billing Modal (Priority: P1)

**Goal**: After creating an account, users verify their email before accessing the app. Once verified, the sign-in handler consumes a `pending_plans/{email}` document if one exists (welcome toast within 60s). Unpaid users keep their account and see a dismiss-proof fullscreen billing modal that auto-closes when Paddle writes their plan. Team members bypass the modal.

**⚠️ Dependency note**: The MandatoryBillingModal wraps `<PricingTable />` whose CTAs call `createPaddleCheckout`. Phase 6 therefore has a hard dependency on the Paddle checkout callable (T045a) and the PricingTable CTA wiring (T045b) below. These tasks are duplicated in Phase 12 but MUST be completed in Phase 6 for the modal to be functional. If Phase 12 runs afterward, T068 and T069 are no-ops.

**Independent Test**: (a) Pay on Paddle without firebaseUid → create account with same email → verify pending_plans consumed, users/{uid} created with plan, welcome toast shown. (b) Create account with fresh email → verify email screen shown, click link, return → mandatory modal shown with no close button. (c) Complete Paddle checkout from modal → modal auto-closes, welcome toast fires. (d) Team member with unclaimed invite creates account → no modal shown.

### Implementation for User Story 14

- [x] T045a [P] [US14] Implement `createPaddleCheckout` callable function in functions/src/index.ts — requires auth, validates priceId, calls `paddle.checkout.create({ items: [{ priceId }], customData: { firebaseUid: auth.uid }, customer: { email: auth.email } })`, returns `{ checkoutUrl }`. Rejects team members with `failed-precondition`. (This task was previously T068 in Phase 12 — moved earlier because the MandatoryBillingModal depends on it. Phase 12 T068 becomes a no-op.)
- [x] T045b [P] [US14] Update src/components/PricingTable.tsx — wire CTA buttons on each plan card to call `createPaddleCheckout(paddlePriceId)`. Open the returned URL via Paddle.js overlay (`Paddle.Checkout.open({ settings: { displayMode: 'overlay' }, items: [{ priceId, quantity: 1 }], customData: { firebaseUid } })`). (This task was previously T069 in Phase 12 — moved earlier. Phase 12 T069 becomes a no-op.)
- [x] T045 [US14] Update `handleCreateAccount` in src/App.tsx: after `createUserWithEmailAndPassword` succeeds, immediately call `sendEmailVerification(user)`. Do NOT create a `users/{uid}` document here — that happens in `onAuthStateChanged` after verification.
- [x] T046 [P] [US14] Create src/components/auth/VerifyEmailScreen.tsx — full-screen component showing "We sent a verification link to [email]", a "Resend verification email" button (rate-limited to one click per 30 seconds client-side), an "I've verified — continue" button that calls `user.reload()` and re-checks `emailVerified`, and a "Sign out" button. Supports RTL, uses i18n `login.verifyEmail.*` keys.
- [x] T047 [US14] Update `onAuthStateChanged` handler in src/App.tsx: when a user is authenticated, first check `user.emailVerified`. If false, render VerifyEmailScreen (do NOT proceed to the rest of the flow). If true, proceed to the `users/{uid}` lookup and pending plan consumption logic.
- [x] T048 [US14] Update `onAuthStateChanged` handler in src/App.tsx: after email is verified, check if `users/{uid}` document exists. If it does, use existing flow. If not, look up `pending_plans/{email.toLowerCase()}`. If pending plan found: create `users/{uid}` with all pending plan fields (plan, credits, isTrial, billingStatus, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, createdAt=now), delete the pending_plans document, and flag the session for welcome toast display.
- [x] T049 [US14] Update `onAuthStateChanged` handler in src/App.tsx: if no pending plan exists AND user is not a team member AND no valid pending team invite is found for the user's email, **do NOT delete the Firebase Auth account** (this replaces the previous delete-account behavior). Instead, create a minimal `users/{uid}` document with `plan: 'none'`, `credits: 0`, `isTrial: false`, `createdAt: now` and flag the session to display the mandatory billing modal.
- [x] T050 [P] [US14] Create src/components/billing/MandatoryBillingModal.tsx — dismiss-proof fullscreen modal rendering the existing `<PricingTable />`. No close button. Does NOT respond to outside clicks. Does NOT respond to the Escape key (add a keyboard handler that swallows Escape). Uses i18n `billing.mandatoryModal.*` keys. Supports RTL layout.
- [x] T051 [US14] Wire MandatoryBillingModal into src/App.tsx — render whenever `billingState.plan === 'none'` AND `!billingState.isTeamMember` AND no valid pending team invite for the user's email. The modal renders as a portal overlay above all other content. Add a `useEffect` that watches `billingState.plan`: when it transitions from `'none'` to any real plan, hide the modal and fire the welcome toast.
- [x] T052 [US14] Implement welcome toast logic in src/App.tsx — use the existing toast system. Show the `login.welcomeTrial` i18n key ("Welcome! Your 7-day trial has started."). Fire the toast ONLY when `users/{uid}.createdAt` is within the last 60 seconds AND `users/{uid}.welcomeToastShown !== true`. Immediately after firing the toast, write `welcomeToastShown: true` to the user document via Firestore `updateDoc`. Also use a session-scoped de-dup flag to prevent React StrictMode double-renders from firing the toast twice before the Firestore write completes.
- [x] T053 [US14] Verify team member bypass in src/App.tsx — when the user has `isTeamMember: true` OR the email matches a valid pending team invite (check via an existing helper or query `team_invites` where `email == user.email && status == 'pending'`), skip the mandatory modal and proceed to the normal team claim flow.

**Checkpoint**: Full email-verified signup + pending plan consumption + mandatory modal + team member bypass flow works end-to-end.

---

## Phase 7: User Story 1 — View Billing Dashboard (Priority: P1)

**Goal**: Users navigate to the Billing page and see their plan, credits, status, and next reset date — all updating in real time.

**Independent Test**: Subscribe on any plan, open /billing, verify everything displays. Consume credits in another tab → credit bar updates without refresh.

### Implementation for User Story 1

- [x] T054 [P] [US1] Create src/components/billing/CreditBar.tsx — progress bar showing `credits / creditsPerMonth`, percentage label, RTL support, uses i18n
- [x] T055 [P] [US1] Create src/components/billing/PlanCard.tsx — displays plan name, billing type (monthly/annual), next reset date, and billing status badge (Active/Trial/Cancelled/Past Due/Cancelling). Uses `billing.planCard.*` i18n keys. Supports RTL.
- [x] T056 [US1] Build the Billing page layout in src/pages/Billing.tsx — use `useBillingState()` hook, render PlanCard + CreditBar, show loading skeleton when `loading`, show trial indicator with upgrade CTA when `isTrial`, show "Team credits — [teamOwnerName]'s account" read-only label when `isTeamMember`. All text uses i18n keys.

**Checkpoint**: Billing page shows accurate, real-time billing information.

---

## Phase 8: User Story 4 — Manage Subscription via Paddle Management URLs (Priority: P1)

**Goal**: "Update Payment Method" and "Cancel Subscription" buttons open Paddle's hosted pages using the URLs stored on billingState. No custom portal session layer.

**Independent Test**: On the Billing page, click "Update Payment Method" → Paddle-hosted update page opens. Click "Cancel" → CancelDialog shown → Paddle cancel page opens. Invoice and receipt PDFs are accessible from Paddle's email delivery.

### Implementation for User Story 4

- [x] T057 [US4] Add "Update Payment Method" button to src/pages/Billing.tsx — visible when `paddleUpdatePaymentUrl` exists and `!isTeamMember`. Clicking opens `billingState.paddleUpdatePaymentUrl` in a new tab. Uses `billing.manage.updatePayment` i18n key.
- [x] T058 [US4] Add "Cancel Subscription" button to src/pages/Billing.tsx — visible when `billingStatus === 'active'` and `!isTeamMember`. Clicking opens the existing CancelDialog.

**Checkpoint**: Users can manage their subscription via Paddle's hosted flows in one click.

---

## Phase 9: User Story 3 — Plan-Gate Enforcement at Credit Deduction (Priority: P1)

**Goal**: Server rejects credit-consuming actions when the user's plan doesn't permit them, with a clear error code.

**Independent Test**: Downgrade a user's plan in Firestore, attempt a gated action → server returns `plan_downgraded` error.

### Implementation for User Story 3

- [x] T059 [US3] Add plan-gate verification in `deductCreditsServer` in functions/src/index.ts — before deducting credits, look up the action in ACTION_FEATURE_MAP, call `resolveEntitlement()` + `checkFeature()`. If not allowed, reject with error code `plan_downgraded` and include `requiredPlan` in the error details. Keep the existing trial_expired check.
- [x] T060 [P] [US3] Add frontend handling for `plan_downgraded` errors in src/App.tsx or a shared error handler — when any generation action returns this error code, show a modal/toast with the upgrade prompt using the `billing.error.planDowngraded` i18n key and include the required plan name.

**Checkpoint**: Server-side plan gating is enforced. No feature can be consumed without plan verification.

---

## Phase 10: User Story 5 — Top-Up Credits via Paddle Checkout (Priority: P2)

**Goal**: Users purchase 100/300/800 credit packs via Paddle checkout overlay. Credits add to balance in real time on webhook success.

**Independent Test**: Select a pack → Paddle checkout opens → complete payment → credit bar increases → success toast appears.

### Implementation for User Story 5

- [x] T061 [US5] Implement `createPaddleTopUp` callable function in functions/src/index.ts — requires auth, validates packId and credit amount against PADDLE_TOPUP_PRICES, creates a Paddle one-time checkout with `customData: { firebaseUid: auth.uid, isTopUp: true, creditAmount }`, returns `{ checkoutUrl }`. Rejects team members and past_due users with `failed-precondition`.
- [x] T062 [P] [US5] Create src/components/billing/TopUpSelector.tsx — renders 3 top-up packs (100 / 300 / 800) with credit count and price from planconfig.ts. Clicking a pack calls `createPaddleTopUp` and opens the returned URL via Paddle.js overlay (`Paddle.Checkout.open(...)`). Uses `billing.topup.*` i18n keys. Supports RTL.
- [x] T063 [US5] Wire TopUpSelector into src/pages/Billing.tsx — visible when `canTopUp: true`. Display a success toast ("X credits added to your account") when `billingState.credits` increases due to a top-up (detect via useBillingState listener with a previous-value comparison).

**Checkpoint**: End-to-end top-up flow works.

---

## Phase 11: User Story 6 — Cancel Subscription (Priority: P2)

**Goal**: Users cancel via a 2-step dialog. The dialog records the reason in `cancellation_logs` and then opens the Paddle-hosted cancel page. The Paddle webhook updates billingState.

**Independent Test**: Click cancel → dialog → submit reason → Paddle cancel page → complete on Paddle → Billing page shows "Cancelled — access until [date]".

### Implementation for User Story 6

- [x] T064 [US6] Update the existing src/components/billing/CancelDialog.tsx — after the user submits the reason and feedback in step 2, write a `cancellation_logs/{uid}_{ts}` document with { uid, email, plan, reason, feedback, createdAt: now }, then open `billingState.paddleCancelUrl` in a new tab and close the dialog.
- [x] T065 [US6] Wire CancelDialog trigger in src/pages/Billing.tsx — the "Cancel Subscription" button (T058) opens the dialog; dialog submission triggers the log write + Paddle redirect flow above.
- [x] T066 [P] [US6] Create src/components/billing/ReactivateButton.tsx — visible when `billingStatus === 'cancelling'`. Opens `billingState.paddleUpdatePaymentUrl` in a new tab (Paddle's management UI handles reactivation from this same entry point — it is the most stable URL). Shows loading state while opening. Uses `billing.cancelled.reactivate` i18n key.
- [x] T067 [US6] Add cancelling state display to src/pages/Billing.tsx — when `billingStatus === 'cancelling'`, show "Cancelled — access until [cancelAt date]" header with ReactivateButton. (The terminal `cancelled` / `none` state is handled by the MandatoryBillingModal from US14 — no separate re-subscribe UI is needed here.)

**Checkpoint**: Full cancellation lifecycle works — dialog records reason, Paddle handles the actual cancel, UI reflects the pending state.

---

## Phase 12: User Story 9 — Upgrade via Paddle Checkout (Priority: P2)

**Goal**: Users upgrade/change plans via Paddle checkout on the Billing page and from the PricingTable. `subscription.updated` webhook (already implemented in T022) updates plan + credits in real time.

**Independent Test**: Click Upgrade → Paddle checkout opens → complete → feature access updates immediately. Downgrade via Paddle portal → pending downgrade notice shown.

### Implementation for User Story 9

- [x] T068 [US9] **(No-op — completed in Phase 6 as T045a.)** `createPaddleCheckout` callable function is already implemented. Verify it still exists in functions/src/index.ts and is exported correctly. No new code.
- [x] T069 [US9] **(No-op — completed in Phase 6 as T045b.)** PricingTable CTAs are already wired to `createPaddleCheckout`. Verify no regression. No new code.
- [x] T070 [US9] Add upgrade CTA section to src/pages/Billing.tsx — visible when `canUpgrade: true`. Shows next tier up with a "Upgrade to [plan]" button calling `createPaddleCheckout` for the target plan's price.
- [x] T071 [US9] Add pending downgrade notice to src/pages/Billing.tsx — when `pendingPlan` and `pendingPlanEffectiveAt` are set on billingState, show a notice: "Your plan will change to [pendingPlan] on [date]". Uses `billing.pendingDowngrade.notice` i18n key.

**Checkpoint**: Plan changes through Paddle are reflected in the app immediately.

---

## Phase 13: User Story 7 — Trial Expiry Handling (Priority: P2)

**Goal**: Trial users with 0 credits see a persistent app-wide banner and are blocked from generation.

**Independent Test**: Create trial user, deplete credits, verify banner and server-side block.

### Implementation for User Story 7

- [x] T072 [P] [US7] Create src/components/billing/TrialExpiredBanner.tsx — persistent banner with "Your trial has ended — upgrade to keep generating" and upgrade CTA. Uses `billing.trial.expired` and `billing.trial.upgradeCta` i18n keys. Supports RTL.
- [x] T073 [US7] Wire TrialExpiredBanner into src/App.tsx app layout — show when `useBillingState()` returns `isTrial: true && credits === 0`. Banner appears above main content on all authenticated pages.
- [x] T074 [US7] Audit `deductCreditsServer` in functions/src/index.ts for the trial_expired server-side block. Read the current implementation, identify whether it returns a `trial_expired` error code when `userData.isTrial === true && userData.credits < actionCost`. If the check is present and correct, document the line number in a commit message and proceed. If the check is missing, partial, or returns a different error code, implement/fix it so that the server returns `{ code: 'trial_expired', requiredPlan: 'starter' }` (or equivalent) in this scenario. This task MUST produce a confirmed and tested pass path — not a "may already work" assumption.

**Checkpoint**: Trial users at 0 credits see the banner and cannot generate.

---

## Phase 14: User Story 8 — Downgrade Enforcement (Priority: P2)

**Goal**: Features the user no longer has access to are hidden/disabled in real time without page refresh.

**Independent Test**: Downgrade a user's plan in Firestore → previously accessible features are immediately hidden in the UI.

### Implementation for User Story 8

- [x] T075 [P] [US8] Wire `useCanUse('carousel')` gate into carousel generation UI. Discovery step: run `grep -r "carousel" src/components src/pages --include="*.tsx" -l` to locate the component that renders the ad format selector; also search for `'carousel'` as a format ID or `format ===` comparisons. Expected location is likely the format/type selector in the generation wizard. Once identified, wrap the carousel option with a `useCanUse('carousel')` check, disable the option when `!allowed`, and show a tooltip "Requires Pro plan — [requiredPlan]" using the `billing.error.planDowngraded` i18n key as the label base. Document the exact file path and line number in the commit.
- [x] T076 [P] [US8] Wire `useCanUse('competitorResearch')` gate into the competitor research entry point UI with plan upgrade tooltip
- [x] T077 [P] [US8] Wire `useCanUse('batchGeneration')` gate into the batch generation toggle with "Requires Scaling plan" tooltip
- [x] T078 [P] [US8] Wire `useCanUse()` gates into remaining gated features: referenceAdUpload, pushToMeta, creativeMemory, creativeScoringEngine, smartRecommendations, variantExploration, multiBrandWorkspaces — disable/hide each with appropriate plan tooltip per entitlements.ts matrix

**Checkpoint**: Downgrading a plan immediately hides/disables inaccessible features.

---

## Phase 15: User Story 11 — Payment Failure Visibility (Priority: P2)

**Goal**: When payment fails, a prominent alert with "Update Payment Method" button and grace period countdown is shown on the Billing page.

**Independent Test**: Simulate `subscription.past_due` or `transaction.payment_failed` → Billing page shows alert, countdown, and update button opens Paddle URL.

### Implementation for User Story 11

- [x] T079 [P] [US11] Create src/components/billing/PaymentFailedAlert.tsx — prominent alert banner with "Payment failed" title, "Update payment method" button opening `billingState.paddleUpdatePaymentUrl` in a new tab, and a countdown timer showing days/hours until `gracePeriodEndsAt`. Uses `billing.paymentFailed.*` i18n keys. Supports RTL.
- [x] T080 [US11] Wire PaymentFailedAlert into src/pages/Billing.tsx — visible when `billingStatus === 'past_due'`. Auto-dismiss when status recovers to 'active' (real-time via useBillingState).

**Checkpoint**: Payment failures are visible with clear remediation path.

---

## Phase 16: User Story 10 — Low Credits Warning (Priority: P3)

**Goal**: Persistent banner when credits drop below 20% of monthly allocation, with top-up CTA.

**Independent Test**: Reduce credits below 20% threshold → banner appears. Top up above threshold → banner disappears.

### Implementation for User Story 10

- [x] T081 [P] [US10] Create src/components/billing/LowCreditsWarning.tsx — persistent banner with "Credits running low" message and top-up CTA link. Threshold: `credits < creditsPerMonth * 0.2 && credits > 0 && !isTrial`. Uses `billing.lowCredits.*` i18n keys. Supports RTL.
- [x] T082 [US10] Wire LowCreditsWarning into src/App.tsx app layout — visible when threshold condition is met via `useBillingState()`. Disappears automatically when credits go above threshold.

**Checkpoint**: Low-credit users see proactive warning with top-up link.

---

## Phase 17: Polish & Cross-Cutting Concerns

**Purpose**: Rewrite tests, deprecate Stripe, verify RTL and team member flows, run end-to-end validation

- [x] T083 [P] Rewrite functions/src/billing/__tests__/billingState.test.ts with the 6 scenarios from LAUNCH_MATRIX 8.C.15: (a) simulated `subscription.created` webhook sets correct plan/credits/paddleSubscriptionId, (b) `subscription.canceled` sets plan='none' and calls notifyGHL, (c) `transaction.completed` with `isTopUp: true` adds credits, (d) `subscription.past_due` keeps credits and calls notifyGHLFailed, (e) invalid Paddle signature returns 400, (f) notifyGHL failure does not throw (GHL sync is best-effort)
- [x] T084 [P] Add a 7th test scenario to functions/src/billing/__tests__/billingState.test.ts: `subscription.created` without `firebaseUid` writes to `pending_plans/{email.toLowerCase()}` and calls notifyGHL with the email
- [x] T085 [P] Comment out / gate Stripe-specific code in functions/src/index.ts — ensure `createStripePortalSession`, `createTopupCheckout` (Stripe version), `stripeWebhook`, `getSubscription` (Stripe version), `ghlpaymentwebhook`, `ghlCancellationWebhook`, and `ghlPaymentFailedWebhook` are no longer exported. Add `// DEPRECATED: replaced by paddleWebhook + notifyGHL` markers. Do NOT delete entirely — keep for reference.
- [x] T086 [P] Remove Stripe SDK imports from active code paths in functions/src/index.ts. Ensure no active code path calls Stripe.
- [ ] T087 Verify all billing and auth UI components render correctly in RTL mode — manually test Billing page, CancelDialog, LoginScreen (both tabs), VerifyEmailScreen, ForgotPasswordDialog, MandatoryBillingModal, TrialExpiredBanner, LowCreditsWarning, PaymentFailedAlert, TopUpSelector, PlanCard, and CreditBar with Arabic locale selected.
- [ ] T088 Verify team member billing restrictions end-to-end (FR-012) — confirm team members see read-only billing view with owner label, "Update Payment Method" and "Cancel" buttons are hidden, top-up is disabled, and the mandatory billing modal never shows for them (either via `isTeamMember: true` or valid pending team invite).
- [ ] T089 Verify structured logging coverage manually at launch (FR-026 / SC-015) — trigger each of the 6 Paddle event types via the Paddle Webhook Simulator and inspect Cloud Functions logs. Every webhook MUST produce a structured log entry with `eventId`, `eventType`, pipeline step, status, and (on failure) an error classification code from the fixed vocabulary. Document the log shape in a short notes file for future log-based metrics and alerting work. Manual verification is acceptable at launch; automated log-shape assertions are tracked as a post-launch improvement (see T089a).
- [ ] T089a Post-launch follow-up — add a functions/src/billing/__tests__/paddleWebhook.logging.test.ts file that captures `console.log` / Firebase Functions logger output during webhook processing, asserts the presence of the expected structured fields and classification codes for each event type, and runs as part of `cd functions && npm test`. Non-blocking for launch; can be added after Phase 17 validation passes.
- [ ] T090 Run quickstart.md validation — verify Paddle dashboard setup (8.A), GHL workflows (8.B), Firebase secrets, price ID configuration, and all 11 post-deploy manual validation checklist items pass end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US2 Unified Billing State (Phase 3)**: Depends on Phase 2 (needs billingState + idempotency + logger + webhook stub)
- **US12 GHL Sync (Phase 4)**: Depends on Phase 3 handlers existing (hooks into them)
- **US13 Email-Only Auth (Phase 5)**: Depends on Phase 2 (needs i18n keys). Can run in parallel with Phases 3–4 (different files).
- **US14 Post-Payment + Modal (Phase 6)**: Depends on Phase 5 (LoginScreen, handleCreateAccount), Phase 2 (useBillingState hook), and Phase 3 (pending_plans written by subscription.created handler). Includes T045a (`createPaddleCheckout` callable) and T045b (PricingTable CTAs) because the MandatoryBillingModal embeds PricingTable.
- **US1 Billing Dashboard (Phase 7)**: Depends on Phase 2 (useBillingState) and Phase 3 (billingState populated by webhooks)
- **US4 Management URLs (Phase 8)**: Depends on Phase 7 (Billing page layout) and Phase 3 (URLs stored on billingState)
- **US3 Plan-Gate (Phase 9)**: Depends on Phase 2 (ACTION_FEATURE_MAP)
- **US5 Top-Up (Phase 10)**: Depends on Phase 7 (Billing page) and Phase 3 (transaction.completed handler)
- **US6 Cancel (Phase 11)**: Depends on Phase 7, Phase 8 (paddleCancelUrl display), Phase 3 (subscription.canceled handler)
- **US9 Upgrade (Phase 12)**: Depends on Phase 7 and Phase 3 (subscription.updated handler). T068 and T069 are no-ops — `createPaddleCheckout` and PricingTable CTAs were completed in Phase 6 (T045a, T045b). Only T070 and T071 add new code.
- **US7 Trial Expiry (Phase 13)**: Depends on Phase 2 (useBillingState in layout)
- **US8 Downgrade Enforcement (Phase 14)**: Depends on Phase 2 (useCanUse hook)
- **US11 Payment Failure (Phase 15)**: Depends on Phase 7 and Phase 3 (past_due handlers)
- **US10 Low Credits (Phase 16)**: Depends on Phase 2 (useBillingState in layout)
- **Polish (Phase 17)**: Depends on all user stories complete

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005 can all run in parallel (different files)
- **Phase 2**: After T006–T009 complete (core billingState + logger), T010–T012, T014–T020 can run in parallel (different files)
- **Phase 3 vs Phase 5**: US2 (backend webhook handlers) and US13 (frontend auth UI) can be worked on in parallel by different developers
- **Phase 4**: T028–T032 (GHL wiring into non-created handlers) can run in parallel
- **Phase 6**: T046 (VerifyEmailScreen) and T050 (MandatoryBillingModal) can run in parallel with each other and with wire-up tasks
- **Phase 14**: T075–T078 are independent feature-area gates that can all run in parallel
- **Phase 17**: T083–T086 can all run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Sequential core (must complete first):
T006: buildBillingState
T007: writeBillingState
T008: idempotency helpers
T009: structured logger

# Then launch all independents in parallel:
T010: notifyGHL            (ghlBillingSync.ts — new file)
T011: notifyGHLFailed      (ghlBillingSync.ts — same file, sequential with T010)
T012: paddleWebhook stub   (paddleWebhook.ts — new file)
T014: writeBillingState wiring into monthly reset
T015: useBillingState hook
T016: useCanUse hook (same file — sequential with T015)
T017: ACTION_FEATURE_MAP
T018: billing.* i18n keys
T019: login.* i18n keys
T020: /billing route
```

---

## Implementation Strategy

### MVP (Phases 1–8 — All P1 Stories)

1. **Phase 1 Setup**: Dependencies, secrets, price maps
2. **Phase 2 Foundational**: billingState, idempotency, logger, webhook stub, GHL helpers, hooks, i18n
3. **Phase 3 US2**: Wire up all 6 Paddle event handlers with dual-write logic
4. **Phase 4 US12**: Wire GHL sync into every handler
5. **Phase 5 US13**: Email-only auth (no Google, tabs, forgot password)
6. **Phase 6 US14**: Email verification + pending plans + mandatory billing modal
7. **Phase 7 US1**: Billing dashboard (PlanCard + CreditBar)
8. **Phase 8 US4**: Update Payment + Cancel buttons (Paddle management URLs)
9. **Phase 9 US3**: Plan-gate enforcement at credit deduction
10. **STOP and VALIDATE**: Paid user flow works end-to-end (pay → verify → see app), unpaid user sees mandatory modal, webhooks fire, GHL sync fires, features are gated.

### Incremental Delivery After MVP

1. MVP → deploy + validate
2. Add Phase 10 (US5 Top-Up) + Phase 11 (US6 Cancel) → revenue lifecycle complete
3. Add Phase 12 (US9 Upgrade) → plan changes work
4. Add Phase 13 (US7 Trial Expiry) + Phase 14 (US8 Downgrade Enforcement) → trial + downgrade UX
5. Add Phase 15 (US11 Payment Failure) → dunning UX
6. Add Phase 16 (US10 Low Credits) → QoL banner
7. Polish (Phase 17) → Stripe deprecated, tests rewritten, RTL verified, quickstart validated

### Parallel Team Strategy

1. Team completes Phases 1 and 2 together
2. Once Phase 2 is done:
   - **Backend dev**: Phase 3 (US2 webhooks) → Phase 4 (US12 GHL sync) → Phase 9 (US3 plan-gate) → Phase 10 backend (US5 createPaddleTopUp) → Phase 12 backend (US9 createPaddleCheckout)
   - **Frontend dev**: Phase 5 (US13 auth) → Phase 6 (US14 mandatory modal + email verification) → Phase 7 (US1 dashboard) → Phase 8 (US4 management URLs)
   - **Backend + frontend handoff**: After both reach their Phase 7/8 checkpoints, converge on Phase 10 (top-up integration), Phase 11 (cancel), Phase 12 (upgrade), and the remaining P2/P3 phases

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Existing CancelDialog.tsx and Billing.tsx are partially built — extend, don't rewrite
- The existing monolithic src/App.tsx receives targeted refactors in Phase 5 and Phase 6 — read the current `onAuthStateChanged` handler around line 980 and the LoginScreen component around line 32 before editing
- billingState.test.ts exists with legacy Stripe scenarios — it will be rewritten in T083 (do not delete it; the existing test file contains structure patterns we reuse)
- All UI strings must use i18n keys (en + ar) — never hardcode English strings
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
