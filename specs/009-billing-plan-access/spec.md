# Feature Specification: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Feature Branch**: `009-billing-plan-access`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Phase 8: Billing, Plan Access, Top-Up, Downgrade, and Cancellation — user-facing billing management surface, plan-gating enforcement, and full lifecycle from trial to paid to cancelled"

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

### User Story 2 - Unified Billing State (Priority: P1)

Every backend path that changes a user's plan or credits (payment webhook, cancellation webhook, monthly reset, top-up completion, payment failure, payment recovery) writes a single derived `billingState` field on the user document. The frontend reads this one field via a real-time listener instead of assembling billing context from scattered document fields.

**Why this priority**: A single source of truth eliminates race conditions and stale-state bugs across the app. Every downstream story depends on `billingState` being accurate and consistent.

**Independent Test**: Can be tested by triggering each backend billing event (payment, cancellation, reset, top-up, failure, recovery) and verifying the `billingState` field is written with the correct shape and values after each event.

**Acceptance Scenarios**:

1. **Given** a new payment webhook fires for a Pro monthly plan, **When** processing completes, **Then** the user document contains a `billingState` field with plan 'pro', credits 2000, isTrial false, billingStatus 'active', and all other required fields populated.
2. **Given** a user confirms cancellation (initial cancel-at-period-end request), **When** processing completes, **Then** `billingState` reflects billingStatus 'cancelling' with `cancelAt` set to the period end date — plan, credits, and access remain unchanged. **Given** the user's paid period has ended and the final post-period-end cancellation webhook fires, **When** processing completes, **Then** `billingState` transitions to billingStatus 'cancelled', plan 'none', credits 0, and `nextResetDate` null.
3. **Given** the monthly credit reset runs, **When** a paid user has 350 credits remaining, **Then** `billingState.credits` is set to the plan's monthly allocation (credits are reset to the plan allotment, not accumulated) and `billingState.nextResetDate` is updated.
4. **Given** a top-up checkout completes, **When** the Stripe webhook fires, **Then** `billingState.credits` increases by the top-up amount.

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

### User Story 4 - Top-Up Credits (Priority: P2)

A user running low on credits can purchase additional credits from the Billing page. They select a top-up pack (100, 300, or 800 credits), complete payment, and see their credit balance increase in real time with a confirmation message.

**Why this priority**: Top-ups are a direct revenue driver and prevent users from hitting credit walls that interrupt their workflow. High value but depends on the billing dashboard (P1) being in place.

**Independent Test**: Can be tested by selecting a top-up pack, completing checkout, and verifying the credit bar increases by the correct amount and a success confirmation appears.

**Acceptance Scenarios**:

1. **Given** a user on any paid plan, **When** they click a 100-credit top-up option, **Then** they are redirected to a payment checkout page.
2. **Given** a user who completes top-up payment, **When** the payment webhook processes, **Then** their credit balance increases by the purchased amount and a success toast appears: "100 credits added to your account."
3. **Given** a user who abandons the top-up checkout, **When** they return to the app, **Then** no credits are added and no error is shown.

---

### User Story 5 - Cancel Subscription (Priority: P2)

A user decides to cancel their subscription. They click cancel on the Billing page, see a confirmation dialog explaining their access continues until the billing period ends, confirm, and the UI updates to show the cancellation date and remaining access period.

**Why this priority**: A clear, honest cancellation flow builds trust and satisfies regulatory expectations. Users must be able to leave without friction.

**Independent Test**: Can be tested by initiating cancellation, confirming, and verifying the UI updates to show "Cancelled — access until [date]" and that access continues until that date.

**Acceptance Scenarios**:

1. **Given** a subscribed user, **When** they click cancel, **Then** a confirmation dialog appears stating: "Your access continues until [period end date]. Are you sure?"
2. **Given** a user who confirms cancellation in step one, **When** the second step appears, **Then** they see a reason dropdown (e.g., "Too expensive", "Not using enough", "Switching to competitor", "Missing features", "Other") and an optional free-text feedback field, followed by a final submit button.
3. **Given** a user who completes both cancellation steps, **When** processing completes, **Then** the Billing page header shows "Cancelled — access until [date]", the subscription is set to cancel at period end (not immediately), and the reason/feedback are stored for analytics.
4. **Given** a cancelled user before their period end date, **When** they use the app, **Then** all features remain accessible until the cancellation date.

---

### User Story 6 - Trial Expiry Handling (Priority: P2)

When a trial user's credits reach zero, a persistent banner appears across the app informing them that their trial has ended and prompting them to upgrade. All generation actions are blocked server-side until they upgrade to a paid plan.

**Why this priority**: Trial-to-paid conversion is a key business metric. Clear trial expiry messaging drives upgrades while preventing confusion about why generation stopped working.

**Independent Test**: Can be tested by creating a trial user, depleting credits to zero, and verifying the persistent banner appears and generation actions are blocked.

**Acceptance Scenarios**:

1. **Given** a trial user with 0 credits, **When** they navigate to any page, **Then** a persistent banner appears: "Your trial has ended — upgrade to keep generating."
2. **Given** a trial user with 0 credits, **When** they attempt any generation action, **Then** the server rejects and the UI shows an upgrade prompt.
3. **Given** a trial user with credits remaining, **When** they navigate the app, **Then** no trial-ended banner is shown.

---

### User Story 7 - Downgrade Enforcement (Priority: P2)

When a user's plan drops (e.g., Scaling to Pro), features they no longer have access to are hidden or disabled on the next UI evaluation — without requiring a full page refresh. The real-time billing state listener triggers an immediate UI re-evaluation.

**Why this priority**: Users must not see or interact with features they no longer pay for. Real-time enforcement prevents confusion and unauthorized feature access.

**Independent Test**: Can be tested by downgrading a user's plan and verifying that previously accessible features are immediately hidden or disabled in the UI without page refresh.

**Acceptance Scenarios**:

1. **Given** a user downgraded from Scaling to Pro, **When** the billing state updates, **Then** Scaling-only features (batch generation, creative scoring, smart recommendations, multi-brand workspaces) are hidden or disabled without page refresh.
2. **Given** a user downgraded from Pro to Starter, **When** the billing state updates, **Then** Pro-only features (carousel ads, competitor research, reference ad upload, push to Meta, creative memory) are hidden or disabled.
3. **Given** a user who upgrades from Starter to Pro, **When** the billing state updates, **Then** newly available features become visible and accessible without page refresh.

---

### User Story 8 - Low Credits Warning (Priority: P3)

When a user's remaining credits drop below 20% of their plan's monthly allocation, a persistent banner appears with a top-up call-to-action. This helps users avoid hitting zero credits mid-workflow.

**Why this priority**: Proactive low-credit warnings reduce user frustration and drive top-up revenue. Lower priority because the system still functions — it is a quality-of-life improvement.

**Independent Test**: Can be tested by reducing a user's credits below the 20% threshold and verifying the warning banner appears with a top-up link.

**Acceptance Scenarios**:

1. **Given** a Pro user (2,000 credits/month) with 350 credits remaining, **When** they navigate the app, **Then** a persistent banner appears: "Credits running low" with a top-up link.
2. **Given** a user with credits above 20% of their allocation, **When** they navigate the app, **Then** no low-credits banner is shown.
3. **Given** a user who tops up credits above the 20% threshold, **When** the top-up completes, **Then** the low-credits banner disappears.

---

### User Story 9 - Payment Failure Visibility (Priority: P2)

When a user's payment fails, the Billing page displays a prominent "Payment failed" alert with an "Update payment method" button (opens the subscription management portal) and a countdown showing when the grace period expires and access will be lost.

**Why this priority**: Users must know their payment failed so they can fix it before auto-cancellation. Silent grace periods lead to surprise cancellations and support tickets.

**Independent Test**: Can be tested by simulating a payment failure event and verifying the Billing page shows the alert, the update button opens the payment portal, and the countdown reflects the grace period end date.

**Acceptance Scenarios**:

1. **Given** a user whose payment has failed and is in the grace period, **When** they open the Billing page, **Then** they see a "Payment failed" alert with an "Update payment method" button and a countdown to grace period expiry.
2. **Given** a user in `past_due` status, **When** they click "Update payment method", **Then** they are directed to the subscription management portal to update their payment details.
3. **Given** a user whose payment is recovered during the grace period, **When** the recovery event processes, **Then** the "Payment failed" alert disappears and billing status returns to "Active" in real time.

---

### Edge Cases

- What happens when a payment webhook fires but the user has not yet created a Firebase account? The existing `pending_plans` collection stores the plan data and applies it on first sign-in.
- What happens when two billing events fire nearly simultaneously (e.g., top-up and monthly reset)? Firestore transactions must prevent race conditions on credit writes.
- What happens when a user's Stripe customer ID is not stored on the user document? Auto-lookup by email and save for future use (existing behavior).
- What happens when a cancelled user attempts to reactivate before their period ends? Allow reactivation — clear the cancel-at-period-end flag and restore active status.
- What happens when a team member views the Billing page? Show the owner's billing information as read-only with a label: "Team credits — [Owner Name]'s account". Team members cannot modify billing.
- What happens when a payment fails and the grace period expires without recovery? Treat as cancellation — set plan to 'none' and credits to 0.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a single derived `billingState` field on each user document containing: plan, isTrial, credits, creditsPerMonth, billingStatus, nextResetDate, cancelAt, gracePeriodEndsAt, stripeCustomerId, canUpgrade, canTopUp, isTeamMember, and teamOwnerUid. The `cancelAt` field holds the period end date when a subscription is set to cancel at period end (null when not pending cancellation).
- **FR-002**: System MUST write `billingState` on every path that changes plan or credits: payment webhook, cancellation webhook, monthly reset, top-up completion, payment failure, payment recovery, and subscription reactivation. Monthly credit reset MUST overwrite the user's credits to the plan's monthly allocation (not additive). Top-up credits purchased mid-cycle are consumed from the current balance and do not carry over past the next reset.
- **FR-003**: System MUST provide a real-time frontend hook that subscribes to `billingState` changes via a live database listener, replacing scattered user document reads.
- **FR-004**: System MUST verify plan entitlement at credit-deduction time by checking whether the requested action is allowed under the user's current plan before deducting credits.
- **FR-005**: System MUST reject credit-consuming actions with a clear error code (`plan_downgraded`) when the user's current plan does not permit the action, even if the frontend still displays the feature.
- **FR-006**: System MUST provide a Billing page displaying: current plan and credits bar, upgrade call-to-action, top-up options (100 / 300 / 800 credits), manage subscription button, cancel subscription button with confirmation dialog, and trial countdown if applicable.
- **FR-007**: System MUST handle trial expiry: when a trial user reaches 0 credits, display a persistent app-wide banner prompting upgrade and block all generation actions server-side.
- **FR-008**: System MUST enforce plan downgrade in real time: when a user's plan drops, features they no longer have access to must be hidden or disabled without requiring a page refresh.
- **FR-009**: System MUST implement the top-up flow end-to-end: user selects pack, completes payment, credits are added, billing state updates, and frontend credit bar reflects the change in real time with a success confirmation.
- **FR-010**: System MUST implement a two-step cancellation flow: first step confirms intent with the period end date displayed; second step collects a cancellation reason (dropdown) and optional free-text feedback before final submission. Subscription is set to cancel at period end (not immediately), reason/feedback are stored for analytics, and the UI reflects the pending cancellation with the access end date.
- **FR-011**: System MUST display a low-credits warning banner with a top-up call-to-action when credits drop below 20% of the plan's monthly allocation.
- **FR-012**: System MUST allow a cancelled user to reactivate their subscription before the billing period ends, restoring active status and clearing the cancellation.
- **FR-013**: System MUST detect when the current user is a team member (`isTeamMember: true`) and prevent them from modifying billing settings (upgrade, top-up, cancel, manage subscription). Full team member billing UI (read-only owner credit display, team labeling) will be addressed in Phase 9 (task 9.10).
- **FR-014**: System MUST display a "Payment failed" alert on the Billing page when billing status is `past_due`, including an "Update payment method" button that opens the subscription management portal and a countdown showing the grace period expiry date. The grace period duration and expiry date are read from the Stripe subscription data (Stripe-managed dunning) — the app does not define or override the grace period length.
- **FR-015**: System MUST replace all direct `userData.plan` and `userData.credits` reads in the generation input flow with reads from the unified billing state hook, ensuring the frontend uses a single billing data source rather than assembling billing context from scattered user document fields.

### Key Entities

- **Billing State**: A derived, denormalized snapshot of a user's billing context (plan, credits, status, capabilities) written by backend functions and consumed by the frontend in real time. Acts as the single source of truth for all plan-gating and billing UI decisions. The `billingStatus` field uses exactly five states: `active` (paid and current), `trialing` (on free trial with credits remaining), `past_due` (payment failed, in grace period), `cancelling` (user cancelled but access continues until period end), `cancelled` (access fully revoked, credits set to 0).
- **Plan**: One of four subscription tiers (Starter, Creator, Pro, Scaling) or special states (trial, none/cancelled). Each plan defines credit allocation, feature access, and team limits.
- **Top-Up Pack**: A one-time credit purchase (100, 300, or 800 credits) that adds to the user's existing balance without changing their plan.
- **Cancellation Record**: A log of the user's cancellation event including reason, feedback, plan at time of cancellation, and timestamp — used for analytics and retention workflows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view their current plan, credits, and billing status on the Billing page within 2 seconds of navigation.
- **SC-002**: All billing state changes (payment, cancellation, top-up, reset) are reflected in the frontend within 3 seconds of the backend event completing, without manual page refresh.
- **SC-003**: 100% of credit-consuming actions are validated against the user's current plan entitlements at deduction time — no feature can be consumed without server-side plan verification.
- **SC-004**: Users can complete a top-up purchase (select pack through to seeing updated credits) in under 2 minutes.
- **SC-005**: Users can complete subscription cancellation (click cancel through to seeing confirmation) in under 30 seconds with no more than 2 confirmation steps.
- **SC-006**: Trial users with 0 credits see the trial-ended banner on 100% of app pages and are blocked from 100% of generation actions.
- **SC-007**: Plan downgrade feature enforcement takes effect within 5 seconds of the billing state change — no stale feature access after downgrade.
- **SC-008**: Low-credits banner appears for 100% of users whose credits drop below the 20% threshold, with no false positives for users above the threshold.

## Clarifications

### Session 2026-04-04

- Q: Do unused top-up credits survive the monthly credit reset, or are all credits reset to the plan allocation? → A: ~~Credits accumulate~~ **Revised**: Monthly reset overwrites credits to the plan allocation. Top-up credits do not carry over past the next reset.
- Q: What are the complete valid `billingStatus` values? → A: Five states: `active`, `trialing`, `past_due`, `cancelling` (access until period end), `cancelled` (access revoked, credits 0).
- Q: Is the payment failure grace period managed by Stripe or the app? → A: Stripe-managed — read grace period end date from Stripe subscription data; no app-level configuration or override.

### Session 2026-04-03

- Q: Should the Billing page surface the payment failure (past_due) state to the user? → A: Yes — show a "Payment failed" alert with an "Update payment method" button and a grace period countdown.
- Q: Should the cancellation dialog collect a reason and feedback from the user? → A: Yes — two-step dialog: confirm cancellation, then reason dropdown + optional feedback text field before final submit.

## Assumptions

- The existing GHL webhook and Stripe integration infrastructure is stable and will not be rewritten — this phase builds on top of it.
- The existing plan definitions in `entitlements.ts` and credit costs in the `COSTS` map are the authoritative source for plan features and action costs.
- The existing `deductCreditsServer` function will be extended (not replaced) to add plan-gate verification.
- The Billing page will be a new route within the existing single-page application, accessible from the main navigation.
- Team billing follows the existing shared-pool model: team members draw from the owner's credits, and billing management is restricted to the team owner.
- Reactivation is only available while the subscription is in the "cancelled but access continues" state (before period end). After the period ends and the final cancellation webhook fires, the user must re-subscribe through the normal purchase flow.
- The `pending_plans` collection mechanism for pre-signup users will continue to work as-is and does not need changes in this phase.
- Phase 9 (task 9.14) will extend the `billingState` shape with additional team fields (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `teamOwnerName`). Phase 8 includes only the minimal team-awareness fields (`isTeamMember`, `teamOwnerUid`) needed for billing action gating.
