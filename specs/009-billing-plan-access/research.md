# Research: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14

## R-001: Paddle Node.js SDK for Backend Integration

**Decision**: Use `@paddle/paddle-node-sdk` (official SDK) for webhook signature verification (`paddle.webhooks.unmarshal`), checkout session creation (`paddle.checkout.create`), and customer/subscription lookups.

**Rationale**: First-party SDK, handles signature algorithm internally, provides type safety, matches the existing pattern used for Stripe. The raw-body requirement for signature verification is correctly handled by the SDK.

**Alternatives Considered**:
- Raw HTTP calls with manual HMAC: Rejected — reimplements what the SDK provides.

## R-002: Paddle Management URLs vs Custom Portal Session

**Decision**: Store the `managementUrls.updatePaymentMethod` and `managementUrls.cancel` that Paddle includes in every subscription event (`subscription.created`, `subscription.updated`, etc.) on the user's `billingState`. Frontend opens these URLs directly when the user clicks "Update Payment Method" or "Cancel".

**Rationale**: Paddle provides these URLs on every subscription event at zero cost. Building a custom portal session callable adds latency (one extra API call) and code surface without benefit. URLs are refreshed on every subscription event, so they stay current.

**Alternatives Considered**:
- Custom portal session callable (`createPaddlePortalSession`): Rejected — unnecessary complexity.

## R-003: Dual-Write Pattern for `subscription.created`

**Decision**: The `subscription.created` handler inspects `customData.firebaseUid`. If present (existing user upgrading from inside the app), write plan data to `users/{uid}` and call `writeBillingState(uid)`. If missing (new user paid on Paddle via the GHL funnel before creating a Firebase Auth account), write to `pending_plans/{email.toLowerCase()}` using the Paddle event's customer email. The sign-in handler consumes the pending document on first login.

**Rationale**: Preserves the existing `pending_plans` mechanism for pre-signup users (matches existing `onAuthStateChanged` flow in `App.tsx`). Enables seamless onboarding: pay on GHL funnel → create account later → pending plan is consumed on first login. Avoids forcing users through a pricing page they already completed.

**Alternatives Considered**:
- Always require `firebaseUid`: Rejected — GHL funnel users don't have one yet.
- Store all users in a unified `users/{email}` collection: Rejected — breaks Firebase Auth uid model.

## R-004: Webhook Idempotency via Firestore Document Creation

**Decision**: Store processed Paddle event IDs in `paddle_events/{eventId}` with fields `eventType`, `processedAt`, and `paddleCustomerId`. Before processing any webhook, check if the document exists. If it does, return 200 OK without re-processing.

**Rationale**: Firestore atomic document creation is reliable and doesn't require external infrastructure. Paddle delivers webhook retries; dedup prevents double-crediting on top-ups and duplicate state transitions.

**Alternatives Considered**:
- In-memory dedup: Rejected — doesn't survive cold starts.
- Redis: Rejected — adds infrastructure.

## R-005: Last-Write-Wins for Duplicate `pending_plans`

**Decision**: When a Paddle webhook writes a `pending_plans/{email}` document that already exists (user paid twice before signup), overwrite the document with the newer plan data. Paddle event idempotency (by event ID) still prevents the literal same event from being applied twice; this rule handles different events for the same email.

**Rationale**: Simpler than merge logic. Matches Paddle's state model — the most recent subscription is authoritative. Both transactions remain in Paddle's billing history, so support can refund duplicates.

**Alternatives Considered**:
- Reject on collision (409): Rejected — blocks the user and requires manual intervention.
- Merge/preserve higher tier: Rejected — complexity without clear user benefit.

## R-006: GHL Sync with Dual Identifier (uid or email)

**Decision**: The `notifyGHL(identifier, event)` helper accepts either a Firebase `uid` string or a raw `email` string. For a uid, the helper reads the `users/{uid}` document for email and contact name. For an email, the helper sends the email directly (used for `pending_plans` users who don't have a Firebase Auth account yet). GHL POST is fire-and-forget — failures are logged but do not throw.

**Rationale**: Supports both existing-user flows and pre-signup flows with a single helper. Fire-and-forget pattern matches FR-018 and prevents GHL availability from blocking billing updates.

**Alternatives Considered**:
- Separate helpers for uid vs email: Rejected — duplicates code.
- Retry queue via Cloud Tasks: Deferred — logged failures are enough for launch; add retry later if GHL failures become frequent.

## R-007: Mandatory Billing Modal Pattern

**Decision**: When an authenticated user's `billingState.plan === 'none'` AND they are NOT a team member (by `isTeamMember: true` or by having an unclaimed team invite for their email), render a fullscreen modal containing `<PricingTable />`. The modal has no close button, ignores outside clicks and the escape key. It closes automatically via a `useEffect` that watches `billingState.plan`: when the plan transitions from `'none'` to a real plan, the modal closes and the welcome toast fires.

**Rationale**: Replaces the previous behavior of DELETING unpaid Firebase Auth accounts — a destructive pattern that caused data loss and confused users. The new pattern is safer and more conversion-friendly: the user can still try the app after paying without needing to re-create their account.

**Alternatives Considered**:
- Redirect to an external pricing page: Rejected — breaks the SPA flow and loses auth state.
- Allow modal dismissal: Rejected — users could bypass and attempt to use paid features.
- Delete the account (previous behavior): Rejected — destructive, confusing, and error-prone.

## R-008: Email Verification as Access Gate

**Decision**: After `createUserWithEmailAndPassword`, call `sendEmailVerification` immediately. Show a dedicated `<VerifyEmailScreen>` with the user's email and a "Resend verification email" button. The app routes (including the mandatory billing modal) are blocked until `user.emailVerified === true` (checked on each `onAuthStateChanged` firing and on explicit `reload`).

**Rationale**: Adds a trust layer to the new email-only auth flow. Prevents abuse of the mandatory modal surface by bots creating fake accounts. Aligns with industry standard for password-based signup.

**Alternatives Considered**:
- No verification: Rejected — weaker security posture.
- Soft verification (banner only): Rejected — users can still access paid features without verification.

## R-009: Forgot Password via Firebase Built-In Flow

**Decision**: The "Forgot Password?" link opens a dialog asking for email, calls `sendPasswordResetEmail(auth, email)`, and displays a non-revealing confirmation message ("If an account exists for this email, a reset link has been sent"). Firebase hosts the reset page — no custom in-app reset UI is built.

**Rationale**: Zero custom code, secure (non-revealing response), and works out of the box. The reset flow is handled entirely by Firebase's hosted UI.

**Alternatives Considered**:
- Custom in-app reset page: Rejected — reimplements Firebase functionality.
- Hide the link at launch: Rejected — users forget passwords; support burden would be unreasonable.

## R-010: Structured Logging with Error Classification Codes

**Decision**: Every billing pipeline step emits a structured log entry with fields `{ step, eventId, eventType, userId?, email?, status, errorCode?, durationMs }`. Error codes use a fixed vocabulary: `paddle_signature_invalid`, `paddle_event_duplicate`, `paddle_event_unknown`, `paddle_price_unmapped`, `ghl_sync_failed`, `user_doc_missing`, `pending_plan_write_failed`, `billing_state_write_failed`.

**Rationale**: Enables end-to-end tracing of a webhook through the pipeline via Cloud Functions logs. Structured format allows log-based metrics to be added later without code changes. Fixed vocabulary prevents log noise and enables reliable filtering.

**Alternatives Considered**:
- Error-only logs: Rejected — missing success traces makes incident triage harder.
- Free-text error messages: Rejected — prevents reliable log-based metrics.
- Full OpenTelemetry tracing: Deferred — heavier infrastructure than needed for launch.

## R-011: Paddle Checkout in Frontend (Overlay vs Redirect)

**Decision**: Use Paddle.js v2 loaded via `<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>` in `index.html`. Initialize with `Paddle.Setup({ token: CLIENT_TOKEN, environment: 'sandbox'|'production' })` in app init. Subscription and top-up checkouts use `Paddle.Checkout.open({ items, customData, settings: { displayMode: 'overlay' } })`.

**Rationale**: In-app overlay checkout keeps users in the SPA context and provides a smoother experience than redirect. Paddle.js is loaded once globally, adding no per-page overhead.

**Alternatives Considered**:
- Full-page redirect: Rejected — breaks SPA state and feels unfinished.
- Custom checkout embed: Rejected — violates PCI compliance (Paddle handles PCI as Merchant of Record).

## R-012: Paddle Product/Price ID Configuration

**Decision**: Store `paddlePriceId` on each plan entry in `src/planconfig.ts` and mirror a backend `PADDLE_PRICE_TO_PLAN` map in `functions/src/index.ts`. Top-up packs have `paddleTopUpPriceIds: { 100, 300, 800 }`. Values are assigned during Paddle dashboard setup (8.A.2, 8.A.3) and hardcoded into the config files.

**Rationale**: Matches the existing Stripe price ID pattern. Hardcoding is acceptable for launch; env-based config can be added later.

**Alternatives Considered**:
- Environment variables: Deferred — launch scope prioritizes code simplicity.
