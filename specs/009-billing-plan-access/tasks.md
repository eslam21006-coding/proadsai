# Tasks: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Input**: Design documents from `/specs/009-billing-plan-access/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Unit test fixtures for billingState writes are included (per LAUNCH_MATRIX task 8.11).

**Organization**: Tasks are grouped by user story. US2 (Unified Billing State) is foundational — all other stories depend on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create new files and directory structure

- [X] T001 Create `functions/src/billing/billingState.ts` with `BillingState` interface, `BillingStatus` type, `CancellationReason` type, and `CancellationRecord` interface per `specs/009-billing-plan-access/contracts/billingState.ts`
- [X] T002 [P] Create `src/hooks/` directory and empty `src/hooks/useBillingState.ts` placeholder
- [X] T003 [P] Create `src/components/billing/` directory structure for billing UI components
- [X] T004 [P] Add `ACTION_FEATURE_MAP` to `functions/src/entitlements.ts` — maps each COSTS action key to its feature gate key (or `null` for actions allowed on all paid plans) per `specs/009-billing-plan-access/data-model.md` Action-Feature Map table

---

## Phase 2: Foundational — Unified Billing State Backend (US2, Blocking)

**Purpose**: Build the `billingState` infrastructure that ALL other stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement `buildBillingState()` pure function in `functions/src/billing/billingState.ts` — accepts user document data (plan, isTrial, credits, stripeCustomerId, isTeamMember, teamOwnerUid, cancelAtPeriodEnd, billingIssueAt, gracePeriodEndsAt, lastCreditReset) and returns a complete `BillingState` object. Compute derived fields: `creditsPerMonth` from plan config, `canUpgrade` (false for scaling/team members), `canTopUp` (false for trial/cancelled/team members), `billingStatus` from document state, `nextResetDate`, `cancelAt`, `gracePeriodEndsAt`
- [X] T006 Implement `writeBillingState(uid: string, db: Firestore)` helper in `functions/src/billing/billingState.ts` — reads user doc, calls `buildBillingState()`, writes the result to `users/{uid}.billingState` field. This is the single write function called by all billing paths
- [X] T007 Wire `writeBillingState()` into `ghlpaymentwebhook` in `functions/src/index.ts` — call after plan/credits are written on new subscription or upgrade
- [X] T008 [P] Wire `writeBillingState()` into `ghlCancellationWebhook` in `functions/src/index.ts` — call after setting plan='none', credits=0, billingStatus='cancelled'
- [X] T009 [P] Modify `monthlyCreditsReset` in `functions/src/index.ts` — change credit update from `credits = creditsPerMonth` to `credits += creditsPerMonth` (additive accumulation). Then call `writeBillingState()` for each updated user
- [X] T010 Wire `writeBillingState()` into `stripeWebhook` handler for `checkout.session.completed` (top-up) in `functions/src/index.ts` — call after credits are incremented
- [X] T011 Wire `writeBillingState()` into `stripeWebhook` handler for `customer.subscription.updated` in `functions/src/index.ts` — on `past_due` status, read `gracePeriodEndsAt` from Stripe subscription object and store on user doc before calling `writeBillingState()`. On payment recovery (status back to `active`), clear `gracePeriodEndsAt` and call `writeBillingState()`
- [X] T012 Implement `useBillingState()` hook in `src/hooks/useBillingState.ts` — subscribe to `users/{uid}` document via Firestore `onSnapshot`, extract `billingState` field, return `{ billingState: BillingState | null, isLoading: boolean }`. Unsubscribe on unmount. Return null before first snapshot
- [X] T013 Write unit test fixtures for `buildBillingState()` in `functions/src/billing/__tests__/billingState.test.ts` — assert: (1) `ghlpaymentwebhook` with pro_monthly sets plan='pro', credits=2000, billingStatus='active'; (2) `ghlCancellationWebhook` sets plan='none', credits=0, billingStatus='cancelled'; (3) monthly reset with 350 existing credits on Pro yields credits=2350; (4) trial user with 0 credits yields billingStatus='trialing', canTopUp=false; (5) team member yields canUpgrade=false, canTopUp=false

**Checkpoint**: billingState is written by all backend paths and readable in real time by the frontend. All downstream stories can now proceed.

---

## Phase 3: User Story 1 — View Billing Dashboard (Priority: P1) 🎯 MVP

**Goal**: Users see their plan, credits, reset date, and status on a dedicated Billing page

**Independent Test**: Navigate to Billing page on any plan — verify plan name, credit bar, reset date, and status display correctly. Consume credits in another tab and confirm real-time update.

### Implementation for User Story 1

- [X] T014 [US1] Add `'billing'` to the `AppPhase` type in `src/store.ts` and add `setAppPhase('billing')` navigation support
- [X] T015 [US1] Add Billing navigation link to the header/sidebar in `src/App.tsx` — clicking triggers `setAppPhase('billing')`
- [X] T016 [P] [US1] Create `CreditBar` component in `src/components/billing/CreditBar.tsx` — displays current credits vs monthly allocation as a progress bar, shows numeric values (e.g., "1,450 / 2,000"), responsive width
- [X] T017 [P] [US1] Create `PlanCard` component in `src/components/billing/PlanCard.tsx` — displays plan name, billing status badge (Active/Trial/Cancelling/etc.), next reset date, and upgrade CTA when `canUpgrade` is true. When `billingStatus === 'trialing'` and `credits > 0`, show remaining trial credits prominently with upgrade CTA
- [X] T018 [US1] Create `Billing` page in `src/pages/Billing.tsx` — uses `useBillingState()` hook, renders `PlanCard`, `CreditBar`, and placeholder sections for top-up/cancel (implemented in later stories). Show loading skeleton while `isLoading` is true. If `isTeamMember`, show read-only notice and hide action buttons
- [X] T019 [US1] Add conditional rendering for `'billing'` phase in `src/App.tsx` — render `<Billing />` when `appPhase === 'billing'`, following the same pattern as other phases
- [X] T020 [US1] Add "Manage subscription" button to `src/pages/Billing.tsx` — calls `createStripePortalSession` and opens returned URL. Hidden for team members and cancelled users

**Checkpoint**: Billing page displays real-time plan/credit info with manage subscription button.

---

## Phase 4: User Story 3 — Plan-Gate Enforcement (Priority: P1)

**Goal**: Server rejects credit-consuming actions when user's plan doesn't permit the action

**Independent Test**: Downgrade a user from Pro to Starter in Firestore, then call `deductCreditsServer` with `action: 'generateCarouselCopies'` — verify rejection with `plan_downgraded` error code.

### Implementation for User Story 3

- [X] T021 [US3] Extend `deductCreditsServer` in `functions/src/index.ts` — before the credit deduction transaction, call `resolveEntitlement(callerUid)` then look up the action in `ACTION_FEATURE_MAP`. If the mapped feature is not null, call `checkFeature(entitlement, feature)`. If not allowed, throw `HttpsError('failed-precondition', 'Feature requires a higher plan', { code: 'plan_downgraded', requiredPlan, currentPlan })`
- [X] T022 [US3] Handle `plan_downgraded` error in frontend — in all places that call `deductCreditsServer` (generation flows in `src/App.tsx` or relevant components), catch the `plan_downgraded` error code and show an upgrade prompt toast/modal instead of a generic error

**Checkpoint**: Server-side plan gating works. Frontend shows upgrade prompt on plan_downgraded errors.

---

## Phase 5: User Story 4 — Top-Up Credits (Priority: P2)

**Goal**: Users purchase additional credits from the Billing page and see balance update in real time

**Independent Test**: Click 100-credit top-up, complete Stripe test checkout, verify credit bar increases by 100 and success toast appears.

### Implementation for User Story 4

- [X] T023 [P] [US4] Create `TopUpSelector` component in `src/components/billing/TopUpSelector.tsx` — renders 3 top-up pack cards from `TOPUP_PACKS` in `src/planconfig.ts` (100/$9, 300/$17, 800/$39). Each card shows credits, price, and a "Buy" button. Disable all cards when `canTopUp` is false
- [X] T024 [US4] Wire top-up flow in `TopUpSelector` — on pack click, map frontend pack ID to backend pack ID (`small` → `topup_100`, `medium` → `topup_300`, `large` → `topup_800`) and call `createTopupCheckout` Cloud Function, redirect to returned Stripe checkout URL. On return from Stripe (success URL), show success toast via `showToast()` from store. `billingState.credits` updates automatically via real-time listener
- [X] T025 [US4] Integrate `TopUpSelector` into `src/pages/Billing.tsx` — replace top-up placeholder section with the component, passing `canTopUp` from `useBillingState()`

**Checkpoint**: Full top-up flow works end-to-end with real-time credit update.

---

## Phase 6: User Story 5 — Cancel Subscription (Priority: P2)

**Goal**: Two-step cancellation with reason collection, reactivation before period end

**Independent Test**: Click cancel, complete both steps, verify UI shows "Cancelled — access until [date]". Then click reactivate, verify status returns to Active.

### Implementation for User Story 5

- [X] T026 [US5] Extend `cancelSubscription` in `functions/src/index.ts` — accept `reason` (required, from CancellationReason enum) and `feedback` (optional string) in request data. Write cancellation record to `cancellations/{docId}` collection with uid, email, plan, reason, feedback, cancelAt, createdAt. Set `billingStatus` to `'cancelling'` and `cancelAt` to period end date on user doc. Call `writeBillingState(uid)`
- [X] T027 [P] [US5] Create `reactivateSubscription` callable Cloud Function in `functions/src/index.ts` — verify caller is authenticated and not a team member. Call `stripe.subscriptions.update(subId, { cancel_at_period_end: false })`. Clear `cancelAtPeriodEnd` and `cancelAt` on user doc. Set `billingStatus` back to `'active'`. Call `writeBillingState(uid)`. Throw `failed-precondition` if no pending cancellation exists
- [X] T028 [US5] Create `CancelDialog` component in `src/components/billing/CancelDialog.tsx` — two-step modal: Step 1 shows "Your access continues until [cancelAt date]. Are you sure?" with Cancel/Continue buttons. Step 2 shows reason dropdown (Too expensive, Not using enough, Switching to competitor, Missing features, Other) and optional free-text feedback field with a Submit button. On submit, calls `cancelSubscription` with reason and feedback
- [X] T029 [P] [US5] Create `ReactivateButton` component in `src/components/billing/ReactivateButton.tsx` — shown only when `billingStatus === 'cancelling'`. Displays "Reactivate subscription" button. On click, calls `reactivateSubscription` callable. Shows success toast on completion
- [X] T030 [US5] Integrate cancellation and reactivation into `src/pages/Billing.tsx` — add cancel button (opens `CancelDialog`) when `billingStatus === 'active'`. Show `ReactivateButton` when `billingStatus === 'cancelling'`. Display "Cancelled — access until [date]" header when cancelling. Hide cancel/reactivate for team members

**Checkpoint**: Full cancellation and reactivation flow works with reason collection.

---

## Phase 7: User Story 6 — Trial Expiry Handling (Priority: P2)

**Goal**: Trial users with 0 credits see persistent banner and are blocked from generation

**Independent Test**: Create trial user, deplete credits to 0, verify banner appears on every page and generation actions are blocked.

### Implementation for User Story 6

- [X] T031 [P] [US6] Create `TrialBanner` component in `src/components/billing/TrialBanner.tsx` — persistent app-wide banner shown when `billingStatus === 'trialing'` and `credits === 0`. Displays "Your trial has ended — upgrade to keep generating." with an upgrade CTA button that navigates to billing page or opens pricing table
- [X] T032 [US6] Add `TrialBanner` to `src/App.tsx` — render above the main content area (outside phase-specific rendering) so it appears on every page. Use `useBillingState()` to drive visibility. Only show when trial + 0 credits
- [X] T033 [US6] Add trial expiry server-side block in `deductCreditsServer` in `functions/src/index.ts` — before credit deduction, if `isTrial === true` and `credits === 0`, reject with `HttpsError('failed-precondition', 'Trial ended', { code: 'trial_expired' })`. Handle this error code in frontend to show upgrade prompt

**Checkpoint**: Trial expiry banner and server-side blocking work together.

---

## Phase 8: User Story 7 — Downgrade Enforcement (Priority: P2)

**Goal**: Features hidden/disabled in real time when plan drops, without page refresh

**Independent Test**: Downgrade user from Scaling to Pro in Firestore, verify Scaling-only features (batch generation, creative scoring, smart recommendations, multi-brand workspaces) are immediately hidden/disabled.

### Implementation for User Story 7

- [X] T034 [US7] Refactor feature gate checks in `src/App.tsx` and relevant components to read from `useBillingState()` hook instead of stale `userPlan` from store — ensure `canUse(billingState.plan, feature)` is called reactively so UI updates when `billingState.plan` changes via the real-time listener
- [X] T035 [US7] Audit all feature-gated UI elements across the app — identify every place that uses `canUse()`, `getFeatureLimit()`, or checks `userPlan` directly. Replace with reactive checks sourced from `useBillingState()`. Key areas: carousel controls, competitor research button, batch generation toggle, workspace switcher, performance dashboard, region editing, reference ad upload, push to Meta, creative memory

**Checkpoint**: Plan downgrade immediately hides/disables features via real-time billingState listener.

---

## Phase 9: User Story 9 — Payment Failure Visibility (Priority: P2)

**Goal**: Payment failure alert with "Update payment method" button and grace period countdown

**Independent Test**: Simulate payment failure (set billingStatus to past_due with gracePeriodEndsAt), verify alert with countdown and working "Update payment method" button.

### Implementation for User Story 9

- [X] T036 [P] [US9] Create `PaymentFailedAlert` component in `src/components/billing/PaymentFailedAlert.tsx` — shown when `billingStatus === 'past_due'`. Displays "Payment failed" alert with red styling. Shows countdown to `gracePeriodEndsAt` (e.g., "3 days remaining"). Includes "Update payment method" button that calls `createStripePortalSession` and redirects to returned URL
- [X] T037 [US9] Integrate `PaymentFailedAlert` into `src/pages/Billing.tsx` — render prominently at top of Billing page when `billingStatus === 'past_due'`

**Checkpoint**: Payment failure visibility works with real-time grace period countdown.

---

## Phase 10: User Story 8 — Low Credits Warning (Priority: P3)

**Goal**: Persistent banner when credits drop below 20% of monthly allocation

**Independent Test**: Set user credits to 350 on Pro plan (2000/month), verify "Credits running low" banner appears with top-up link. Top up above threshold, verify banner disappears.

### Implementation for User Story 8

- [X] T038 [P] [US8] Create `LowCreditsBanner` component in `src/components/billing/LowCreditsBanner.tsx` — shown when `credits < creditsPerMonth * 0.2` and `creditsPerMonth > 0` and `billingStatus` is `active` or `cancelling`. Displays "Credits running low" with a top-up CTA that navigates to billing page. Not shown for trial users or cancelled users
- [X] T039 [US8] Add `LowCreditsBanner` to `src/App.tsx` — render above main content area (same level as `TrialBanner`), driven by `useBillingState()`. Ensure mutual exclusivity with `TrialBanner` (trial banner takes precedence)

**Checkpoint**: Low credits warning appears/disappears reactively based on credit threshold.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T040 Verify Firestore security rules in `firestore.rules` — ensure `billingState` field is read-only from client (only Cloud Functions can write it). Users can read their own `billingState` but not others'
- [ ] T041 Run full manual validation against `specs/009-billing-plan-access/quickstart.md` — test all billing flows in Stripe test mode: new subscription, top-up, cancellation, reactivation, payment failure, monthly reset accumulation, plan-gate rejection, trial expiry, downgrade enforcement, low credits warning

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 Billing Dashboard (Phase 3)**: Depends on Foundational
- **US3 Plan-Gate (Phase 4)**: Depends on Foundational — can run in PARALLEL with US1
- **US4 Top-Up (Phase 5)**: Depends on US1 (needs Billing page)
- **US5 Cancellation (Phase 6)**: Depends on US1 (needs Billing page)
- **US6 Trial Expiry (Phase 7)**: Depends on Foundational — can run in PARALLEL with US1
- **US7 Downgrade (Phase 8)**: Depends on Foundational — can run in PARALLEL with US1
- **US9 Payment Failure (Phase 9)**: Depends on US1 (needs Billing page)
- **US8 Low Credits (Phase 10)**: Depends on Foundational — can run in PARALLEL with US1
- **Polish (Phase 11)**: Depends on all stories complete

### User Story Dependencies

```
Phase 2 (Foundational)
├── US1 (Billing Dashboard) ──→ US4 (Top-Up)
│                             ──→ US5 (Cancellation)
│                             ──→ US9 (Payment Failure)
├── US3 (Plan-Gate)          [parallel with US1]
├── US6 (Trial Expiry)       [parallel with US1]
├── US7 (Downgrade)          [parallel with US1]
└── US8 (Low Credits)        [parallel with US1]
```

### Within Each User Story

- Backend changes before frontend components
- Components before page integration
- Core implementation before polish

### Parallel Opportunities

**After Foundational completes, these can ALL run in parallel:**
- US1 (Billing page) — frontend
- US3 (Plan-gate) — backend `deductCreditsServer`
- US6 (Trial expiry) — banner + server block
- US7 (Downgrade enforcement) — UI refactor
- US8 (Low credits banner) — banner component

**After US1 completes, these can run in parallel:**
- US4 (Top-up) — Billing page component
- US5 (Cancellation) — Billing page component + new backend function
- US9 (Payment failure) — Billing page component

---

## Parallel Example: After Foundational

```
Agent 1: T014-T020 (US1 — Billing Dashboard page)
Agent 2: T021-T022 (US3 — Plan-gate enforcement in deductCreditsServer)
Agent 3: T031-T033 (US6 — Trial expiry banner + server block)
Agent 4: T034-T035 (US7 — Downgrade enforcement UI refactor)
Agent 5: T038-T039 (US8 — Low credits warning banner)
```

## Parallel Example: After US1 Complete

```
Agent 1: T023-T025 (US4 — Top-up flow)
Agent 2: T026-T030 (US5 — Cancellation + reactivation)
Agent 3: T036-T037 (US9 — Payment failure alert)
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (billingState backend + hook + tests)
3. Complete Phase 3: US1 (Billing Dashboard)
4. Complete Phase 4: US3 (Plan-Gate Enforcement)
5. **STOP and VALIDATE**: Billing page shows real-time data, plan-gate blocks unauthorized actions
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → billingState infrastructure ready
2. US1 (Dashboard) → Users can see billing info (MVP!)
3. US3 (Plan-Gate) → Revenue protection active
4. US4 (Top-Up) → Revenue generation active
5. US5 (Cancellation) → Lifecycle complete
6. US6 + US7 + US8 + US9 → Polish and edge cases
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- billingState is the single source of truth — all UI reads from `useBillingState()` hook
- `buildBillingState()` is a pure function for easy unit testing
- Monthly credit reset is now additive (credits accumulate)
- Grace period is Stripe-managed — no app-level configuration
- Team member billing management is blocked in Phase 8; full team UI deferred to Phase 9
- Top-up pack IDs: frontend uses `small`/`medium`/`large`, backend expects `topup_100`/`topup_300`/`topup_800` — mapping required in T024
