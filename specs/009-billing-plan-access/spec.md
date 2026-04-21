# Feature Specification: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Feature Branch**: `009-billing-plan-access`  
**Created**: 2026-04-03  
**Updated**: 2026-04-14 (second pass — dual-write pending_plans, mandatory billing modal, first-login welcome toast)  
**Status**: Draft  
**Input**: User description: "Phase 8 (Paddle + GHL Sync) — Paddle is the Merchant of Record handling tax, invoicing, and payment processing. GHL remains the CRM, now receiving post-payment webhooks FROM Firebase (direction reversed). Paddle sends subscription and transaction events to Firebase, which updates the user's billing state and then forwards a sync event to GHL inbound webhooks (best-effort). Plan management uses Paddle-provided `managementUrls` (update payment, cancel) stored on the user document — no custom portal session layer. Google sign-in is removed; users authenticate with email + password only. After paying on Paddle, users land on the app and create a Firebase Auth account with the exact email they paid with; if an email already exists in Firestore (from Paddle), they see a welcome trial toast; if not, they see an in-app pricing modal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Billing Dashboard (Priority: P1)

A subscribed user navigates to the Billing page to see their current plan, remaining credits, next credit reset date, and subscription status at a glance. The information updates in real time — if credits are consumed in another tab, the credit bar reflects the change without page reload.

**Why this priority**: Without a reliable billing dashboard, users cannot make informed decisions about upgrades, top-ups, or cancellations. It is the foundation every other billing interaction builds on.

**Independent Test**: Can be fully tested by subscribing on any plan and verifying the billing page displays accurate plan name, credit count, reset date, and subscription status — delivers immediate value as the single source of billing truth.

**Acceptance Scenarios**:

1. **Given** a user on the Pro plan with 1,450 credits remaining, **When** they open the Billing page, **Then** they see "Pro Plan", a credit bar showing 1,450 / 2,000, next reset date, and status "Active".
2. **Given** a user whose credits are consumed in another browser tab, **When** the Billing page is already open, **Then** the credit bar updates in real time without manual refresh.
3. **Given** a trial user with 23 credits remaining, **When** they open the Billing page, **Then** they see "Trial" label, a countdown or indicator of trial status, and a prominent upgrade call-to-action.

---

### User Story 2 - Unified Billing State Driven by Paddle Webhooks (Priority: P1)

Every backend path that changes a user's plan or credits — Paddle webhook events (subscription.created, subscription.updated, subscription.canceled, subscription.past_due, transaction.completed, transaction.payment_failed) and the scheduled monthly credit reset — writes a single derived `billingState` field on the user document. The frontend reads this one field via a real-time listener instead of assembling billing context from scattered document fields.

**Why this priority**: A single source of truth eliminates race conditions and stale-state bugs across the app. Every downstream story depends on `billingState` being accurate and consistent.

**Independent Test**: Can be tested by simulating each Paddle event type and verifying the `billingState` field is written with the correct shape and values after each event.

**Acceptance Scenarios**:

1. **Given** a `subscription.created` webhook fires with a Pro monthly price and `customData.firebaseUid` present (existing user upgrading from inside the app), **When** processing completes, **Then** the `users/{uid}` document is updated with plan 'pro', credits 2000, billingStatus 'active', paddleSubscriptionId populated, and the management URLs (update payment, cancel) stored; `billingState` is recomputed and written.
2. **Given** a `subscription.created` webhook fires without a `customData.firebaseUid` (new user paid on Paddle via the GHL funnel BEFORE creating a Firebase Auth account), **When** processing completes, **Then** a `pending_plans/{email.toLowerCase()}` document is created with the same plan data and will be consumed on first sign-in.
3. **Given** a `subscription.canceled` webhook fires, **When** processing completes, **Then** `billingState` reflects plan 'none', credits 0, billingStatus 'cancelled'.
4. **Given** the monthly credit reset runs, **When** a paid user's credits are reset, **Then** `billingState.credits` matches the plan's monthly allocation and `billingState.nextResetDate` is updated.
5. **Given** a top-up transaction completes, **When** the Paddle webhook fires with `isTopUp: true` in custom data, **Then** `billingState.credits` increases by the top-up amount.
6. **Given** a `subscription.past_due` webhook fires, **When** processing completes, **Then** `billingState.billingStatus` is 'past_due', credits remain unchanged, and the grace period countdown begins.

---

### User Story 3 - Plan-Gate Enforcement at Credit Deduction (Priority: P1)

When a user triggers a credit-consuming action, the server verifies the action is allowed under the user's current plan before deducting credits. If the user's plan was downgraded since the frontend last loaded (e.g., from Pro to Starter), the server rejects the action with a clear error rather than silently deducting.

**Why this priority**: Without server-side plan gating, users could consume features they no longer pay for — leading to revenue loss and entitlement inconsistency.

**Independent Test**: Can be tested by downgrading a user's plan in the database and then attempting a credit-consuming action that requires the old plan — the server must reject with a descriptive error.

**Acceptance Scenarios**:

1. **Given** a user on the Starter plan, **When** they attempt a carousel generation (requires Pro or higher), **Then** the server rejects with error code `plan_downgraded` and a message indicating the feature requires a higher plan.
2. **Given** a user on the Pro plan, **When** they attempt a standard generation they are entitled to, **Then** credits are deducted normally.
3. **Given** a user whose plan was downgraded from Pro to Starter between page loads, **When** they click generate on a Pro-only feature still visible in the UI, **Then** the server rejects and the frontend shows a clear upgrade prompt.

---

### User Story 4 - Manage Subscription via Paddle Management URLs (Priority: P1)

A subscribed user can open Paddle-hosted management flows (update payment method, cancel subscription, view invoices and receipts) directly from the Billing page. The app uses the `managementUrls` that Paddle sends with every subscription event — stored on the user document — instead of generating portal sessions on demand.

**Why this priority**: Self-service subscription management is table-stakes for SaaS. Paddle provides these URLs on every subscription event at zero engineering cost, removing the need to build a custom portal session layer. Invoices, receipts, and payment method management are fully handled by Paddle's hosted flows.

**Independent Test**: Can be tested by clicking "Update Payment Method" on the Billing page and verifying the Paddle-hosted update flow opens, displays accurate subscription information, and allows the user to update their payment details.

**Acceptance Scenarios**:

1. **Given** a subscribed user on the Billing page, **When** they click "Update Payment Method", **Then** the Paddle-hosted payment update page opens in a new tab using the stored `paddleUpdatePaymentUrl`.
2. **Given** a subscribed user on the Billing page, **When** they click "Cancel Subscription", **Then** after a confirmation dialog, the Paddle-hosted cancel page opens using the stored `paddleCancelUrl`.
3. **Given** a user receives an invoice or receipt via Paddle's standard email delivery, **When** they click the link in the email, **Then** they can view and download the PDF without any app involvement.
4. **Given** a `subscription.updated` webhook fires with refreshed management URLs, **When** processing completes, **Then** the stored URLs on the user document are replaced with the new ones so the frontend always links to current URLs.

---

### User Story 5 - Top-Up Credits via Paddle Checkout (Priority: P2)

A user running low on credits can purchase additional credits from the Billing page. They select a top-up pack (100, 300, or 800 credits), complete payment via Paddle checkout (overlay or redirect), and see their credit balance increase in real time with a confirmation message.

**Why this priority**: Top-ups are a direct revenue driver and prevent users from hitting credit walls that interrupt their workflow. High value but depends on the billing dashboard (P1) being in place.

**Independent Test**: Can be tested by selecting a top-up pack, completing Paddle checkout, and verifying the credit bar increases by the correct amount and a success confirmation appears.

**Acceptance Scenarios**:

1. **Given** a user on any paid plan, **When** they click a 100-credit top-up option, **Then** a Paddle checkout overlay opens with the correct one-time price and custom data flagging the purchase as a top-up.
2. **Given** a user who completes top-up payment, **When** the `transaction.completed` webhook processes with `isTopUp: true`, **Then** their credit balance increases by the purchased amount and a success toast appears: "100 credits added to your account."
3. **Given** a user who abandons the top-up checkout, **When** they return to the app, **Then** no credits are added and no error is shown.

---

### User Story 6 - Cancel Subscription (Priority: P2)

A user decides to cancel their subscription. They click cancel on the Billing page, see a confirmation dialog, confirm, and are taken to Paddle's hosted cancel page to complete the cancellation. When the Paddle webhook fires, the UI updates to show the cancellation date and remaining access period. Users who cancel also have the option to provide a reason and optional feedback, stored for analytics.

**Why this priority**: A clear, honest cancellation flow builds trust and satisfies regulatory expectations. Users must be able to leave without friction.

**Independent Test**: Can be tested by initiating cancellation, confirming, completing Paddle's hosted cancel flow, and verifying the UI updates to show "Cancelled — access until [date]" and that access continues until that date.

**Acceptance Scenarios**:

1. **Given** a subscribed user, **When** they click cancel, **Then** an in-app confirmation dialog appears explaining that access continues until the period end, followed by a reason selector and optional feedback field.
2. **Given** a user who submits the cancellation reason dialog, **When** the dialog closes, **Then** the reason and feedback are stored in the cancellation log and the user is redirected to the Paddle-hosted cancel page to confirm on Paddle's side.
3. **Given** a user who completes cancellation on Paddle, **When** the `subscription.canceled` webhook fires, **Then** the Billing page header shows "Cancelled — access until [date]" and all features remain accessible until that date.
4. **Given** a cancelled user before their period end date, **When** they use the app, **Then** all features remain accessible until the cancellation date.

---

### User Story 7 - Trial Expiry Handling (Priority: P2)

When a trial user's credits reach zero, a persistent banner appears across the app informing them that their trial has ended and prompting them to upgrade. All generation actions are blocked server-side until they upgrade to a paid plan.

**Why this priority**: Trial-to-paid conversion is a key business metric. Clear trial expiry messaging drives upgrades while preventing confusion about why generation stopped working.

**Independent Test**: Can be tested by creating a trial user, depleting credits to zero, and verifying the persistent banner appears and generation actions are blocked.

**Acceptance Scenarios**:

1. **Given** a trial user with 0 credits, **When** they navigate to any page, **Then** a persistent banner appears: "Your trial has ended — upgrade to keep generating."
2. **Given** a trial user with 0 credits, **When** they attempt any generation action, **Then** the server rejects and the UI shows an upgrade prompt.
3. **Given** a trial user with credits remaining, **When** they navigate the app, **Then** no trial-ended banner is shown.

---

### User Story 8 - Downgrade Enforcement (Priority: P2)

When a user's plan drops (e.g., Scaling to Pro), features they no longer have access to are hidden or disabled on the next UI evaluation — without requiring a full page refresh. The real-time billing state listener triggers an immediate UI re-evaluation.

**Why this priority**: Users must not see or interact with features they no longer pay for. Real-time enforcement prevents confusion and unauthorized feature access.

**Independent Test**: Can be tested by downgrading a user's plan and verifying that previously accessible features are immediately hidden or disabled in the UI without page refresh.

**Acceptance Scenarios**:

1. **Given** a user downgraded from Scaling to Pro, **When** the billing state updates, **Then** Scaling-only features (batch generation, creative scoring, smart recommendations, multi-brand workspaces) are hidden or disabled without page refresh.
2. **Given** a user downgraded from Pro to Starter, **When** the billing state updates, **Then** Pro-only features (carousel ads, competitor research, reference ad upload, push to Meta, creative memory) are hidden or disabled.
3. **Given** a user who upgrades from Starter to Pro, **When** the billing state updates, **Then** newly available features become visible and accessible without page refresh.

---

### User Story 9 - Upgrade and Plan Change via Paddle Checkout (Priority: P2)

A user who wants to change their plan can do so through Paddle checkout (overlay on the pricing page) or via the Paddle-hosted subscription management URLs. Plan changes processed by Paddle generate a `subscription.updated` webhook, which updates the user's plan, credits, and feature access.

**Why this priority**: Plan changes are a core subscription lifecycle event. Users expect to upgrade instantly when they need more features.

**Independent Test**: Can be tested by upgrading a plan through Paddle checkout, verifying the subscription.updated webhook fires, and checking that feature access updates immediately.

**Acceptance Scenarios**:

1. **Given** a Starter user, **When** they click "Upgrade" on the Billing page or pricing table, **Then** a Paddle checkout opens (overlay or redirect) with the target plan's price.
2. **Given** a user who completes an upgrade through Paddle, **When** the `subscription.updated` webhook fires, **Then** their plan, credits, and feature access update in the app in real time.
3. **Given** a user who completes a plan change through Paddle's hosted management flow, **When** the `subscription.updated` webhook fires, **Then** the app reflects the new plan without any manual intervention.

---

### User Story 10 - Low Credits Warning (Priority: P3)

When a user's remaining credits drop below 20% of their plan's monthly allocation, a persistent banner appears with a top-up call-to-action. This helps users avoid hitting zero credits mid-workflow.

**Why this priority**: Proactive low-credit warnings reduce user frustration and drive top-up revenue. Lower priority because the system still functions — it is a quality-of-life improvement.

**Independent Test**: Can be tested by reducing a user's credits below the 20% threshold and verifying the warning banner appears with a top-up link.

**Acceptance Scenarios**:

1. **Given** a Pro user (2,000 credits/month) with 350 credits remaining, **When** they navigate the app, **Then** a persistent banner appears: "Credits running low" with a top-up link.
2. **Given** a user with credits above 20% of their allocation, **When** they navigate the app, **Then** no low-credits banner is shown.
3. **Given** a user who tops up credits above the 20% threshold, **When** the top-up completes, **Then** the low-credits banner disappears.

---

### User Story 11 - Payment Failure Visibility and Dunning (Priority: P2)

When a user's payment fails, the Billing page displays a prominent "Payment failed" alert with an "Update payment method" button (opening the Paddle-hosted update flow) and a countdown showing when the grace period expires. Paddle handles dunning retries automatically, and the app surfaces the `past_due` status derived from both `subscription.past_due` and `transaction.payment_failed` webhook events. GHL is notified via the dedicated failed-payment sync webhook to trigger email dunning.

**Why this priority**: Users must know their payment failed so they can fix it before auto-cancellation. Silent grace periods lead to surprise cancellations and support tickets.

**Independent Test**: Can be tested by simulating a payment failure event and verifying the Billing page shows the alert, the update button opens the Paddle update flow, the countdown reflects the grace period end date, and GHL receives the dunning sync webhook.

**Acceptance Scenarios**:

1. **Given** a user whose payment has failed and is in the grace period, **When** they open the Billing page, **Then** they see a "Payment failed" alert with an "Update payment method" button and a countdown to grace period expiry.
2. **Given** a user in `past_due` status, **When** they click "Update payment method", **Then** they are directed to the Paddle-hosted payment update flow via the stored `paddleUpdatePaymentUrl`.
3. **Given** a user whose payment is recovered (by Paddle dunning or manual update), **When** the recovery event processes, **Then** the "Payment failed" alert disappears and billing status returns to "Active" in real time.

---

### User Story 12 - Firebase-to-GHL Sync (Priority: P1)

Every Paddle webhook processed by Firebase triggers a best-effort sync POST to the GHL inbound webhook URL. GHL uses this payload to run CRM automations: tagging contacts with their paid plan, sending welcome emails for new subscriptions, triggering win-back automations on cancellation, and sending dunning emails on payment failure. GHL sync failures never block the billing state update.

**Why this priority**: GHL is the CRM and marketing automation engine. Losing sync means broken welcome emails, missing plan tags, and no dunning. But blocking billing on a third-party CRM would be catastrophic — hence the best-effort pattern.

**Independent Test**: Can be tested by simulating each Paddle webhook and verifying GHL receives the correct sync payload. Also testable by deliberately breaking the GHL URL and confirming billing state still updates successfully with a logged failure.

**Acceptance Scenarios**:

1. **Given** a `subscription.created` webhook succeeds for an existing user (with `firebaseUid`), **When** GHL sync runs, **Then** the GHL inbound webhook receives a POST with `{ email, contactName, plan, billingStatus, event: 'subscription.created', credits, paddleSubscriptionId, updatePaymentUrl }` — email and name read from the `users/{uid}` document.
2. **Given** a `subscription.created` webhook succeeds for a pre-signup user (without `firebaseUid`), **When** GHL sync runs, **Then** GHL receives the same payload — email is taken directly from the Paddle event (since no Firebase Auth account exists yet to read a user doc from).
3. **Given** a `subscription.canceled` webhook succeeds, **When** GHL sync runs, **Then** GHL receives `{ email, event: 'subscription.canceled' }` to trigger the win-back automation.
4. **Given** a `subscription.past_due` or `transaction.payment_failed` webhook succeeds, **When** GHL failed-sync runs, **Then** GHL receives `{ email, contactName, event, updatePaymentUrl }` on the dunning webhook URL to trigger the dunning email.
5. **Given** the GHL sync POST fails (network error, 500, timeout), **When** the error occurs, **Then** the billing state update still completes and the failure is logged without throwing.

---

### User Story 13 - Email-Only Authentication (Priority: P1)

Google sign-in is removed from the app entirely. Users authenticate with email and password only. The login screen has two tabs: Login (existing users) and Create Account (new users). Users are auto-switched between tabs when their entered email doesn't match the expected state (e.g., entering an unknown email on Login auto-switches to Create Account with the email pre-filled).

**Why this priority**: The new billing flow requires exact email matching between Paddle payment records and Firebase Auth accounts. Google sign-in introduces mismatch risk (user pays with one email, signs in with their Google email) that would break the billing-to-auth link. Removing it ensures every paying user reaches the correct Firestore record on first sign-in.

**Independent Test**: Can be tested by (a) logging in with an existing email+password account, (b) creating a new account with a fresh email, (c) entering an unknown email on the Login tab and verifying auto-switch to Create Account with the email pre-filled, and (d) confirming Google sign-in is completely absent from the UI.

**Acceptance Scenarios**:

1. **Given** a user visits the login page, **When** the page loads, **Then** they see two tabs (Login / Create Account) with email and password fields, no Google sign-in button, and no Google-related UI.
2. **Given** a user enters a valid email+password on the Login tab, **When** they submit, **Then** they are authenticated and land in the authenticated app state.
3. **Given** a user enters an unknown email on the Login tab, **When** they submit, **Then** an inline error appears ("No account found with this email. Please create an account first.") AND the tab auto-switches to Create Account with the email pre-filled.
4. **Given** a user submits the Create Account form, **When** password and confirm-password match and password length is ≥8, **Then** a Firebase Auth account is created, a verification email is sent to the provided address, and the user is shown an "Verify your email" screen (not the main app) with a resend button.
4a. **Given** a user has created an account but not yet verified their email, **When** they click the verification link in the email, **Then** they are redirected to the app and, on next load, are admitted through the normal post-signin flow (pending plan consumption or mandatory billing modal).
5. **Given** a user enters an email on Create Account that already exists in Firebase Auth, **When** they submit, **Then** an inline error appears ("An account with this email already exists. Please log in.") AND the tab auto-switches to Login with the email pre-filled.
6. **Given** a user submits Create Account with mismatched passwords, **When** validation runs, **Then** an inline error appears ("Passwords don't match") and the account is not created.
7. **Given** a user submits Create Account with a password shorter than 8 characters, **When** validation runs, **Then** an inline error appears ("Password must be at least 8 characters") and the account is not created.

---

### User Story 14 - Post-Payment Account Creation, Pending Plans, and Mandatory Billing Modal (Priority: P1)

After a user pays on Paddle via the external GHL funnel (before having a Firebase Auth account), their plan is written to `pending_plans/{email.toLowerCase()}` by the Paddle webhook. When the user later creates a Firebase Auth account with the same email, the app consumes the pending plan document, creates the `users/{uid}` record with the plan data, deletes the pending document, and shows a welcome toast (only on the very first login after account creation). If a user creates a Firebase Auth account without having paid first, they are NOT deleted — instead, their account remains and they see a mandatory fullscreen billing modal containing the pricing table, which they cannot dismiss until they complete a Paddle checkout. Once Paddle writes the plan, the modal automatically closes and the welcome toast appears.

**Why this priority**: This is the primary onboarding path. Every paying customer goes through it. Missing or broken handling means paid customers cannot access what they paid for, or unpaid users get trapped or deleted.

**Independent Test**: Can be tested by (a) simulating a Paddle `subscription.created` webhook without `firebaseUid`, verifying the `pending_plans/{email}` document is created, (b) creating a Firebase Auth account with that exact email, verifying the pending doc is consumed into `users/{uid}`, welcome toast appears, and billing state is populated, (c) separately creating a Firebase Auth account with a fresh email that has no pending plan, verifying the mandatory billing modal appears with no close button, (d) completing a Paddle checkout from the modal and verifying the modal auto-closes and the welcome toast fires.

**Acceptance Scenarios**:

1. **Given** a user's email already has a `pending_plans/{email.toLowerCase()}` document (from Paddle webhook) with plan and credits, **When** they create a Firebase Auth account with the same email, **Then** the app creates a `users/{uid}` document with the pending plan data, deletes the pending document, and shows a welcome toast: "Welcome! Your 7-day trial has started."
2. **Given** a user creates a Firebase Auth account with an email that has NO pending plan and NO team invite, **When** they sign in for the first time, **Then** the system keeps the Firebase Auth account (does NOT delete it), creates a minimal `users/{uid}` document with `plan: 'none'`, `credits: 0`, and triggers a mandatory fullscreen billing modal containing the pricing table.
3. **Given** a user is viewing the mandatory billing modal, **When** they attempt to dismiss it, **Then** the modal cannot be closed — it has no close button and does not respond to outside clicks or the escape key. Only completing a Paddle checkout closes it.
4. **Given** a user in the mandatory billing modal clicks a plan, **When** Paddle checkout completes and the `subscription.created` webhook writes the plan, **Then** the real-time billing state listener detects `plan` transitioning from `'none'` to the purchased plan, automatically closes the modal, and displays the welcome toast.
5. **Given** a user successfully logs in and the account is fresh (`createdAt` is within the last 60 seconds), **When** the app loads, **Then** the welcome toast "Welcome! Your 7-day trial has started." is shown exactly once.
6. **Given** a user logs in to an account created more than 60 seconds ago, **When** the app loads, **Then** no welcome toast is shown (prevents re-display on subsequent logins).
7. **Given** the email case differs between Paddle payment and Firebase Auth creation (e.g., `User@Example.com` vs `user@example.com`), **When** the `pending_plans` lookup runs, **Then** the match is case-insensitive (both stored and queried using lowercased email) so the user still lands on their existing pending plan.
8. **Given** a user is a team member (either already has `isTeamMember: true` or has an unclaimed pending team invite matching their email), **When** they verify their email and sign in, **Then** the mandatory billing modal is NOT shown — they enter the app normally via the team claim flow and their credit bar reads from the team owner's billing state.

---

### Edge Cases

- What happens when a Paddle webhook fires before the user has created a Firebase Auth account? The Paddle webhook detects the missing `firebaseUid` in `customData` and writes the plan data to `pending_plans/{email.toLowerCase()}`. When the user later creates their Firebase Auth account with the same email, the sign-in handler consumes the pending document into `users/{uid}` and deletes it.
- What happens when two billing events fire nearly simultaneously (e.g., top-up and monthly reset)? Firestore transactions prevent race conditions on credit writes.
- What happens when a cancelled user attempts to reactivate before their period ends? They are directed back to the Paddle-hosted management flow; Paddle handles reactivation and the `subscription.updated` webhook restores active status.
- What happens when a team member views the Billing page? They see the owner's billing information as read-only with a label: "Team credits — [Owner Name]'s account". Team members cannot modify billing.
- What happens when a payment fails and the grace period expires without recovery? Paddle sends `subscription.canceled`, which sets plan to 'none' and credits to 0. Paddle dunning handles retry attempts automatically before this point.
- What happens when Paddle's signature verification fails? The webhook is rejected with 400 and logged for investigation. Billing state is not modified.
- What happens when Paddle delivers the same webhook event more than once? The system deduplicates by Paddle event ID — events already processed are acknowledged but not re-applied. This prevents double-crediting on top-ups and duplicate state transitions.
- What happens when GHL sync fails (network error, GHL down, or URL misconfigured)? The billing state update still proceeds. The sync failure is logged but does not throw. GHL sync is always best-effort.
- What happens when Paddle sends a `subscription.updated` event with the same price ID (e.g., a metadata-only change)? The handler refreshes management URLs on the user document but does not change plan or credits.
- What happens if a user enters the wrong email on Login and the email IS valid but belongs to another user? They get a "wrong password" error (standard Firebase Auth behavior). The system does not reveal whether the email exists — this is standard security practice.
- What happens if a user pays on Paddle with email A but tries to create a Firebase Auth account with email B? The Firebase Auth account is created, no pending plan is found for email B, and the user sees the mandatory billing modal as if they never paid. Recovery requires contacting support.
- What happens if the user creates a Firebase Auth account but never completes a Paddle checkout from the mandatory billing modal? Their Firebase Auth account remains, their `users/{uid}` document stays at `plan: 'none', credits: 0`, and the modal continues to be shown on every sign-in until they complete a purchase. The account is NOT deleted.
- What happens if the welcome toast logic runs twice by accident (e.g., React StrictMode double-render)? The `createdAt` 60-second window plus idempotent toast display prevents visual duplication — only one toast is shown.
- What happens if a user pays on Paddle twice before creating a Firebase Auth account (two `subscription.created` webhooks for the same email)? Last-write-wins: the second webhook overwrites the existing `pending_plans/{email}` document with the newer plan data. Both transactions remain in Paddle's billing history and are available for support to review or refund. Paddle event idempotency dedup (event-ID-based) still prevents literal duplicate delivery of the same event from being applied twice.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a single derived `billingState` field on each user document containing: plan, isTrial, credits, creditsPerMonth, billingStatus, nextResetDate, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, canUpgrade, canTopUp, isTeamMember, and teamOwnerUid.
- **FR-002**: System MUST write `billingState` on every path that changes plan or credits: all Paddle webhook handlers (subscription.created, subscription.updated, subscription.canceled, subscription.past_due, transaction.completed with isTopUp, transaction.payment_failed) and the monthly credit reset. The `subscription.created` handler MUST use dual-write logic: if `customData.firebaseUid` is present, write to `users/{uid}` and call `writeBillingState(uid)`; if `firebaseUid` is missing or empty, write the plan data to `pending_plans/{email.toLowerCase()}` instead.
- **FR-003**: System MUST provide a real-time frontend hook that subscribes to `billingState` changes via a live database listener, replacing scattered user document reads.
- **FR-004**: System MUST verify plan entitlement at credit-deduction time by checking whether the requested action is allowed under the user's current plan before deducting credits.
- **FR-005**: System MUST reject credit-consuming actions with a clear error code (`plan_downgraded`) when the user's current plan does not permit the action, even if the frontend still displays the feature.
- **FR-006**: System MUST provide a Billing page displaying: current plan and credits bar, upgrade call-to-action, top-up options (100 / 300 / 800 credits), "Update Payment Method" button (opens stored `paddleUpdatePaymentUrl`), cancel subscription button with confirmation dialog (opens stored `paddleCancelUrl`), and trial indicator if applicable.
- **FR-007**: System MUST handle trial expiry: when a trial user reaches 0 credits, display a persistent app-wide banner prompting upgrade and block all generation actions server-side.
- **FR-008**: System MUST enforce plan downgrade in real time: when a user's plan drops, features they no longer have access to must be hidden or disabled without requiring a page refresh.
- **FR-009**: System MUST implement the top-up flow end-to-end: user selects pack, completes payment via Paddle one-time checkout with `customData: { firebaseUid, isTopUp: true, creditAmount }`, the `transaction.completed` webhook adds credits, billing state updates, and frontend credit bar reflects the change in real time with a success confirmation.
- **FR-010**: System MUST implement a two-step cancellation flow: first step collects cancellation reason (dropdown) and optional free-text feedback (stored in the cancellation log for analytics); second step opens Paddle's hosted cancel page via `paddleCancelUrl` where the user completes the cancellation on Paddle's side. The resulting `subscription.canceled` webhook updates the app's billing state.
- **FR-011**: System MUST display a low-credits warning banner with a top-up call-to-action when credits drop below 20% of the plan's monthly allocation.
- **FR-012**: System MUST show team members a read-only view of the owner's billing state, labeled appropriately, and prevent team members from modifying billing settings.
- **FR-013**: System MUST display a "Payment failed" alert on the Billing page when billing status is `past_due`, including an "Update payment method" button that opens the stored `paddleUpdatePaymentUrl` and a countdown showing the grace period expiry date.
- **FR-014**: System MUST process Paddle webhook events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `transaction.completed`, and `transaction.payment_failed`. Subscription pausing is out of scope for this phase.
- **FR-015**: System MUST verify Paddle webhook signatures on all incoming webhook requests using the raw request body. Invalid signatures MUST return 400 without modifying billing state.
- **FR-016**: System MUST deduplicate all incoming Paddle webhooks by event ID — if an event has already been processed, acknowledge it without re-applying any state changes.
- **FR-017**: System MUST extract and store `managementUrls.updatePaymentMethod` (as `paddleUpdatePaymentUrl`) and `managementUrls.cancel` (as `paddleCancelUrl`) from every subscription webhook so the frontend always has current URLs for payment management and cancellation.
- **FR-018**: System MUST forward a best-effort sync POST to the GHL inbound webhook URL after every successful Paddle webhook processing. The success sync goes to `GHL_PADDLE_SYNC_WEBHOOK_URL` with `{ email, contactName, plan, billingStatus, event, credits, paddleSubscriptionId, updatePaymentUrl }`. The dunning sync (for past_due or payment_failed events) goes to `GHL_PADDLE_FAILED_WEBHOOK_URL` with `{ email, contactName, event, updatePaymentUrl }`. The sync helper MUST accept either a Firebase `uid` (reads user doc for email/name) or a raw `email` string (for pre-signup users written to `pending_plans`). GHL sync failures MUST be logged but MUST NOT throw or block billing state updates.
- **FR-019**: System MUST provide a callable function `createPaddleCheckout(priceId)` that generates a Paddle checkout session with `customData: { firebaseUid }` for subscription purchases. System MUST provide a callable function `createPaddleTopUp(creditAmount, topUpPriceId)` that generates a one-time Paddle checkout with `customData: { firebaseUid, isTopUp: true, creditAmount }`.
- **FR-020**: System MUST remove Google sign-in entirely. The login screen MUST NOT contain any Google sign-in button, Google provider configuration, or Google-related error states.
- **FR-021**: System MUST provide a login screen with two tabs: Login (email + password + submit + forgot-password link) and Create Account (email + password + confirm password + submit). Switching tabs is a state toggle — no route change.
- **FR-022**: System MUST support account creation via `createUserWithEmailAndPassword` with the following validations: password length ≥ 8 characters, password and confirm-password match.
- **FR-022a**: System MUST send an email verification message immediately after account creation and MUST block access to the app (including the mandatory billing modal and all paid features) until the user's email is verified. Unverified users MUST see a dedicated "Verify your email" screen with a resend-verification button. Once verified, the user MUST proceed through the normal post-signin flow (pending plan consumption or mandatory billing modal).
- **FR-023**: System MUST handle email collision: if a user attempts to create an account with an email already in use, show an inline error and auto-switch to the Login tab with the email pre-filled. Conversely, if a user attempts to log in with an email that has no Firebase Auth account, show an inline error and auto-switch to the Create Account tab with the email pre-filled.
- **FR-023a**: System MUST provide a "Forgot Password?" link on the Login tab that triggers Firebase's built-in password reset email flow. Clicking the link prompts the user for an email, calls the password reset email API, and shows a non-revealing confirmation message ("If an account exists for this email, a reset link has been sent") regardless of whether the account exists. The password reset page is hosted by Firebase — no custom in-app reset UI is built. The "Forgot Password?" link MUST NOT appear on the Create Account tab.
- **FR-024**: System MUST detect post-Paddle-payment users on first sign-in. After a Firebase Auth account is created (or on any sign-in where the `users/{uid}` document does not yet exist), the system MUST look up `pending_plans/{email.toLowerCase()}`. If a pending document exists, the system MUST: (a) create the `users/{uid}` document using the pending plan data, (b) delete the pending document, (c) show a welcome toast if the account was created within the last 60 seconds. If no pending document exists, the system MUST: (a) keep the Firebase Auth account (do NOT delete it), (b) create a minimal `users/{uid}` document with `plan: 'none'` and `credits: 0`, (c) display a mandatory fullscreen billing modal showing the pricing table.
- **FR-024a**: The mandatory billing modal MUST have no close button, MUST NOT respond to outside clicks or the escape key, and MUST remain visible until the user's `billingState.plan` transitions from `'none'` to a real plan via a completed Paddle checkout. Once the transition is detected by the real-time billing state listener, the modal MUST automatically close and the welcome toast MUST be displayed. The modal MUST NOT be shown when the user has `isTeamMember: true` or when their email matches a valid, unclaimed pending team invite — team members enter the app normally and read their owner's billing state.
- **FR-024b**: The welcome toast MUST only be shown on the very first sign-in after account creation. The system MUST check that the account's `createdAt` timestamp is within the last 60 seconds AND the account's `welcomeToastShown` field is not `true`. Immediately after the toast is displayed, the system MUST set `users/{uid}.welcomeToastShown: true` so that rapid sign-out / sign-in sequences within the 60-second window do not cause the toast to re-display.
- **FR-025**: System MUST support Arabic (RTL) and English for all billing UI surfaces — Billing page, banners (trial expiry, low credits, payment failure), cancellation dialog, top-up flow, login screen, create account screen, welcome toast, and pricing modal — from launch.
- **FR-026**: System MUST emit structured logs at every step of the billing pipeline: Paddle webhook received (with event ID and type), signature verification result, idempotency check result, event routing decision, billing state write result, GHL sync attempt, and GHL sync result. Every error MUST include an explicit classification code such as `paddle_signature_invalid`, `paddle_event_duplicate`, `paddle_event_unknown`, `paddle_price_unmapped`, `ghl_sync_failed`, `user_doc_missing`, or `pending_plan_write_failed`. Success logs are required at each step to enable end-to-end tracing of a webhook through the pipeline.

### Key Entities

- **Billing State**: A derived, denormalized snapshot of a user's billing context (plan, credits, status, Paddle management URLs, capabilities) written by backend functions and consumed by the frontend in real time. Acts as the single source of truth for all plan-gating and billing UI decisions. The `billingStatus` field follows a defined lifecycle: `trial` -> `active` <-> `past_due` -> `cancelled` -> `none`. A `past_due` status can recover to `active` when payment succeeds. Subscription pausing is not supported in this phase.
- **Plan**: One of four subscription tiers (Starter, Creator, Pro, Scaling) or special states (trial, none/cancelled). Each plan defines credit allocation, feature access, team limits, and a `paddlePriceId`.
- **Top-Up Pack**: A one-time credit purchase (100, 300, or 800 credits) processed as a Paddle one-time transaction with custom data flagging `isTopUp: true` and specifying `creditAmount`. Each pack has a `paddleTopUpPriceId`.
- **Cancellation Record**: A log of the user's cancellation event including reason, feedback, plan at time of cancellation, and timestamp — used for analytics and retention workflows. Captured before the user is redirected to the Paddle-hosted cancel page.
- **Paddle Customer**: The customer record in Paddle linked to the user's account, identified by Paddle customer ID. Paddle acts as the Merchant of Record — handling tax calculation, collection, and remittance globally.
- **Paddle Subscription**: The recurring billing relationship managed by Paddle, including billing cycle, plan/price, payment method, status, and management URLs. Paddle handles proration for mid-cycle changes and dunning for failed payments. Management URLs are refreshed on every subscription event.
- **Paddle Event**: A processed Paddle webhook event, stored by event ID for idempotency deduplication. Prevents duplicate credit additions or state transitions when Paddle delivers the same event more than once.
- **GHL Sync Event**: A best-effort outbound POST from Firebase to a GHL inbound webhook URL carrying billing event data. GHL uses it to run CRM automations (tagging, welcome emails, dunning). Failures are logged but never block billing updates.
- **Pending Plan**: A Firestore document at `pending_plans/{email.toLowerCase()}` holding plan data for a user who paid on Paddle before creating a Firebase Auth account. Consumed by the sign-in handler on first login into `users/{uid}` and then deleted.
- **Mandatory Billing Modal**: A fullscreen, dismiss-proof modal containing the pricing table, shown to any authenticated user whose `billingState.plan === 'none'`. Closes automatically when the real-time billing state listener detects a plan change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view their current plan, credits, and billing status on the Billing page within 2 seconds of navigation.
- **SC-002**: All billing state changes (Paddle events, monthly reset, top-up) are reflected in the frontend within 3 seconds of the backend event completing, without manual page refresh.
- **SC-003**: 100% of credit-consuming actions are validated against the user's current plan entitlements at deduction time — no feature can be consumed without server-side plan verification.
- **SC-004**: Users can complete a top-up purchase (select pack through to seeing updated credits) in under 2 minutes.
- **SC-005**: Trial users with 0 credits see the trial-ended banner on 100% of app pages and are blocked from 100% of generation actions.
- **SC-006**: Plan downgrade feature enforcement takes effect within 5 seconds of the billing state change — no stale feature access after downgrade.
- **SC-007**: Low-credits banner appears for 100% of users whose credits drop below the 20% threshold, with no false positives for users above the threshold.
- **SC-008**: 100% of Paddle webhook events are signature-verified before processing — no unverified webhook can modify billing state.
- **SC-009**: 100% of successful Paddle webhooks result in a GHL sync attempt (success or logged failure) — no silent drops.
- **SC-010**: Users can complete Paddle-hosted payment method updates or cancellations in a single click from the Billing page (no intermediate loading screens, direct URL open).
- **SC-011**: 100% of new Firebase Auth accounts created for paid users (Paddle payment made prior, `pending_plans` document exists) are correctly linked to their existing plan data on first sign-in — no paid user sees the mandatory billing modal instead of the app.
- **SC-012**: The login screen contains zero Google sign-in references, buttons, provider imports, or error messages. Verified by code audit and UI inspection.
- **SC-013**: 0% of unpaid users have their Firebase Auth accounts deleted — all unpaid users retain their account and see the mandatory billing modal instead.
- **SC-014**: The welcome toast is shown exactly once per new account. It never appears on subsequent sign-ins (verified by the 60-second `createdAt` window check).
- **SC-015**: 100% of Paddle webhook deliveries produce a structured log entry with the event ID, event type, processing result, and any error classification code — enabling full traceability of every webhook through the billing pipeline.

## Clarifications

### Session 2026-04-03

- Q: Should the Billing page surface the payment failure (past_due) state to the user? -> A: Yes — show a "Payment failed" alert with an "Update payment method" button and a grace period countdown.
- Q: Should the cancellation dialog collect a reason and feedback from the user? -> A: Yes — two-step dialog: confirm cancellation and collect reason/feedback, then redirect to Paddle-hosted cancel page.

### Session 2026-04-11

- Q: Should Stripe be replaced with Paddle as the billing provider? -> A: Yes — Paddle replaces Stripe entirely. Paddle acts as Merchant of Record, handling payments, tax, invoices, receipts, and hosted management flows.
- Q: How does Paddle connect to GHL? -> A: Paddle subscription events are forwarded from Firebase to GHL via best-effort inbound webhooks — the direction is Firebase -> GHL (not GHL -> Firebase).
- Q: Are there existing Stripe subscribers that need migration to Paddle? -> A: No — the product has not launched yet, so there are no existing paying users.
- Q: Should webhook processing be idempotent to handle duplicate deliveries? -> A: Yes — all webhooks are deduplicated by Paddle event ID.
- Q: What is the full billing status lifecycle? -> A: Core lifecycle without pause: trial -> active <-> past_due -> cancelled -> none.
- Q: Should the Billing page and billing banners/dialogs support Arabic (RTL)? -> A: Yes — Arabic and English from day one.
- Q: What happens if GHL webhook delivery fails when forwarding Paddle events? -> A: Fire-and-forget with logging. GHL sync failures never block billing state updates.

### Session 2026-04-14

- Q: Should the app use custom Paddle portal sessions or Paddle-provided management URLs from webhook events? -> A: Use Paddle-provided `managementUrls` stored on the user document. Every subscription event includes refreshed URLs, so the app always has a valid link for payment updates and cancellation. No custom portal session layer is built.
- Q: Is Google sign-in kept or removed? -> A: Removed entirely. Email + password only. The login screen has Login and Create Account tabs with auto-switching on email collisions or missing accounts. This prevents email mismatches between Paddle payment records and Firebase Auth accounts.
- Q: How does post-payment account creation work? -> A: After paying on Paddle, users arrive at the app and create a Firebase Auth account with the same email. The app looks up the email in Firestore (case-insensitive) and shows a welcome toast if a record exists, or a pricing modal if not. Firebase Auth accounts are linked to Firestore records by email.
- Q: Is `subscription.past_due` handled separately from `transaction.payment_failed`? -> A: Yes — both events set `billingStatus: 'past_due'`, but they are separate handlers in the webhook router. Both trigger a dunning sync to GHL via the failed-payment webhook URL.
- Q: Should a custom portal session callable (`createPaddlePortalSession`) be built? -> A: No. The management URLs stored on the user document are used directly. No custom portal session layer exists.

### Session 2026-04-14 (third pass — clarify)

- Q: Should new Firebase Auth accounts require email verification before the user can access the app? -> A: Yes — require email verification. On account creation, a verification email is sent. The user cannot access the app (including the mandatory billing modal and any paid features) until they click the verification link. Unverified accounts see an "Verify your email" screen with a resend button.
- Q: How is the mandatory billing modal handled for team members who don't own a plan? -> A: Suppress the modal when the user has `isTeamMember: true` OR their email matches a valid pending team invite. Team members enter the app normally and read their owner's billing state — the modal is never shown to them.
- Q: What happens if a user pays on Paddle twice before creating a Firebase Auth account, producing two `subscription.created` webhooks for the same email? -> A: Last-write-wins. The second webhook overwrites the existing `pending_plans/{email}` document with the newer plan data. Both transactions remain in Paddle's billing history for support/refund review, but the pending plan reflects only the most recent purchase.
- Q: What observability is required for the billing pipeline at launch? -> A: Structured logging at each step of the billing pipeline (webhook received, signature verified, event routed, billing state written, GHL sync attempted, GHL sync result). Every error MUST log with an explicit classification code (e.g., `paddle_signature_invalid`, `paddle_event_duplicate`, `ghl_sync_failed`, `user_doc_missing`). Alerting infrastructure is out of scope for launch but logs are structured to enable log-based metrics later.
- Q: How does the "Forgot Password?" flow work in the new email-only login screen? -> A: Firebase built-in password reset. Clicking the link prompts for an email, calls Firebase's password reset email, and shows a non-revealing confirmation ("If an account exists for this email, a reset link has been sent"). Firebase hosts the reset page — no custom in-app reset UI is built.

### Session 2026-04-14 (second pass)

- Q: Should the `pending_plans` collection be retained or replaced? -> A: Retained. Paddle webhooks that arrive without a `firebaseUid` (new users paying via the GHL funnel before creating a Firebase Auth account) write plan data to `pending_plans/{email.toLowerCase()}`. The sign-in handler consumes the pending document on first login. The existing flow continues to work with field names updated for Paddle.
- Q: What should happen to users who create a Firebase Auth account without having paid first (no pending plan, no team invite)? -> A: Keep the Firebase Auth account. Do NOT delete it. Create a minimal `users/{uid}` document with `plan: 'none'` and `credits: 0`. Display a mandatory fullscreen billing modal containing the pricing table — no close button, cannot be dismissed.
- Q: How does the mandatory billing modal close? -> A: Automatically, via the real-time billing state listener. When Paddle checkout completes and the webhook writes the plan, `billingState.plan` transitions from `'none'` to the purchased plan. The modal closes and the welcome toast is shown.
- Q: Should the welcome toast show on every sign-in? -> A: No. Only on the very first sign-in after account creation. The system checks `createdAt` is within the last 60 seconds; otherwise the toast is suppressed.
- Q: How does `notifyGHL` handle pre-signup users who have no `users/{uid}` document? -> A: The helper accepts either a Firebase uid OR a raw email string. For uid, it reads the user doc for email and contact name. For email, it sends the email directly and omits contact name (or uses the Paddle event's customer name if present).
- Q: How do the GHL funnel CTA buttons pass user identity to Paddle? -> A: They do not pass `firebaseUid` — new users coming from the funnel don't have one yet. The Paddle checkout URL includes only the price ID. The webhook handler detects the missing `firebaseUid` in `customData` and routes the event to `pending_plans/{email}` using the Paddle customer email.

## Assumptions

- Paddle is the Merchant of Record and sole billing provider from day one. No existing Stripe subscribers need migration. The product has not launched yet.
- Paddle handles tax calculation, collection, filing, remittance, dunning, proration, and hosted flows for payment updates, cancellation, and invoices/receipts globally.
- Paddle provides `managementUrls.updatePaymentMethod` and `managementUrls.cancel` on every subscription event. These URLs are stored on the user document and used directly by the frontend.
- Paddle dunning handles failed payment retries automatically. The app surfaces the status via `subscription.past_due` and `transaction.payment_failed` webhooks but does not implement retry logic.
- GHL is the CRM and marketing automation engine. Firebase POSTs billing events to GHL inbound webhook URLs on every successful Paddle webhook processing. Sync is best-effort.
- The existing plan definitions in `entitlements.ts` and credit costs in the `COSTS` map remain the authoritative source for plan features and action costs.
- Team billing follows the shared-pool model: team members draw from the owner's credits, and billing management is restricted to the team owner.
- The `pending_plans/{email.toLowerCase()}` collection is retained. Paddle webhooks that fire before the user creates a Firebase Auth account (new users paying via the GHL funnel) write plan data to `pending_plans`. The sign-in handler consumes the pending document on first login, creates the `users/{uid}` record, and deletes the pending document. Field names are updated to reflect Paddle (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`) — Stripe field names are removed.
- Top-up packs are processed as one-time Paddle transactions with `customData.isTopUp: true` and `customData.creditAmount`, not as subscription changes.
- Firestore email lookups for post-payment account linking MUST be case-insensitive. Both the write path (Paddle webhook writing to `pending_plans`) and the read path (sign-in handler consuming the pending doc) use `email.toLowerCase()` as the document key.
- Unpaid users (those who create a Firebase Auth account without a pending plan and without a team invite) MUST NOT have their Firebase Auth accounts deleted. The previous behavior of deleting such accounts is explicitly replaced by the mandatory billing modal pattern.
- The mandatory billing modal is dismiss-proof — no close button, no outside-click dismissal, no escape key. It closes only when the real-time billing state listener detects a plan transition from `'none'` to a real plan.
- Google sign-in is removed permanently (no backwards compatibility for old Google accounts — there are no existing users).
- A grace period of 2 days applies after a payment failure before the subscription is considered at risk of full cancellation. Paddle's dunning retry schedule operates within this window.
- All billing-related UI (banners, dialogs, toasts, login, create account, welcome toast, pricing modal) must support Arabic (RTL) and English from day one.
