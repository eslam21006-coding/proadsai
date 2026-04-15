# Implementation Plan: Team Management

**Branch**: `006-team-management` | **Date**: 2026-04-10 | **Last Updated**: 2026-04-15 (two Phase 8 / 009 follow-up clarification passes) | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-team-management/spec.md`

## Summary

Team Management enables team owners to invite members, manage roles (editor/viewer), enforce plan-based seat limits, share credits from the owner's pool, and gate credit-consuming actions for viewer-role members. The critical fix is the invite acceptance flow (previously 404). The implementation spans 9 Cloud Functions (8 original + `declineTeamInvite`), 2 frontend pages (JoinTeam + Team modal), Firestore security rules, a 10-assertion fixture test suite, and a workspace switcher component for Scaling plan teams.

**Phase 8 (009 / Paddle) coordination**: Phase 8 migrated billing from Stripe to Paddle, removed Google sign-in, and added an email-verification gate plus a dismiss-proof mandatory billing modal for users whose `billingState.plan === 'none'`. Phase 9 must coordinate with Phase 8 at six boundaries:

1. **Email verification gate**: new-user invite flow creates the account via email+password, triggers `sendEmailVerification`, and routes the user to the Phase 8 "Verify your email" screen before any claim runs.
2. **Device-independent invite discovery with explicit consent**: the post-signin handler queries `team_invites` by `inviteeEmailNormalized` (`status in ['pending','sent']`, not expired) on every sign-in where the user has no `users/{uid}` document OR `billingState.plan === 'none'`. If a match is found, the user is routed to `/join?inviteId=<match>` for explicit Accept/Decline — **never** a silent auto-claim. This closes the team-hijack vector where an attacker could create an invite to a stranger's email and silently conscript them on their next sign-in. A new `declineTeamInvite` Cloud Function marks the invite `declined` (terminal, seat released).
3. **Mandatory billing modal suppression**: the Phase 8 modal must be suppressed when `isTeamMember: true` OR when a valid unclaimed `team_invites` match exists on the user's email. The suppression gate re-queries `team_invites` once per sign-in (reusing the same query as boundary #2) and caches the boolean in memory — no denormalized `hasPendingTeamInvite` flag is maintained. 009 FR-024a is authoritative; Phase 9 relies on it rather than re-implementing modal logic.
4. **Dormant plan capture at claim time**: `claimTeamInvite` preserves the claimant's prior paid billing context in `users/{uid}.dormantPlan` from two sources handled uniformly in the same transaction: (a) a prior `pending_plans/{email.toLowerCase()}` document left by a Paddle payment made before the Firebase Auth account was created, OR (b) an existing active paid subscription already on `users/{uid}` at claim time (`plan !== 'none'` AND `paddleSubscriptionId` set). The dormant snapshot is inert while the user is on the team — it does not influence credit deduction, plan gating, or the mandatory billing modal — and is restored verbatim by `removeTeamMember` on removal, so a paying user who gets invited, joins the team, and later leaves lands directly back on the subscription they are still being billed for.
5. **Paddle webhook write-through to `dormantPlan`**: all Paddle webhook handlers that mutate subscription state (`subscription.updated`, `subscription.past_due`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`) and the monthly credit reset job run a secondary-index query on `users` where `dormantPlan.paddleSubscriptionId == eventSubscriptionId` and apply the same field changes to the dormant snapshot they would apply to a live `billingState`. A Firestore index on `dormantPlan.paddleSubscriptionId` supports this lookup. This keeps the snapshot fresh throughout extended team membership so the FR-009 restore on removal is a pure in-document copy with no synchronous Paddle API call.
6. **Welcome / removal toast coordination**: the Phase 8 "Welcome! Your 7-day trial has started." toast is suppressed on any post-signin path that matches a pending team invite. `claimTeamInvite` atomically sets `users/{uid}.teamWelcomeToastShown: true` and the post-signin handler fires "You've joined [Owner Name]'s team." exactly once (decoupled from Phase 8's 60-second `createdAt` window since verification may happen hours later). `removeTeamMember` atomically writes `users/{uid}.pendingRemovalToast = { ownerName, shownAt: null }`; the post-signin handler consumes and deletes the field on the first post-removal sign-in, guaranteeing exactly-once delivery of "You've been removed from [Owner Name]'s team."

Phase 9 extends the unified `billingState` document (already carrying `isTeamMember` and `teamOwnerUid` from Phase 8) with team-shape fields (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `teamOwnerName`, `teamRole`, `isTeamViewer`) rather than introducing a parallel listener. Paddle-specific billing fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`) remain owner-only; team members read them only as part of the read-only owner credit display.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: React 19, Firebase Cloud Functions v2, Firebase Auth, Firestore, Vite 7, Tailwind CSS 3, Paddle billing integration (via Phase 8 `billingState` / 009)
**Storage**: Firestore (`team_invites`, `teamMemberships`, `users/{uid}`, `users/{uid}/team`, `rateLimits`, `pending_plans` consumed by Phase 8 + consumed-at-claim by Phase 9). New indexes: `team_invites.inviteeEmailNormalized` (for device-independent discovery + modal suppression), `users.dormantPlan.paddleSubscriptionId` (for Paddle webhook write-through)
**Testing**: Custom fixture test runner (`teamFixtureTests.ts`) — `npm run build && node lib/teamFixtureTests.js`
**Target Platform**: Web (SPA), Firebase hosting
**Project Type**: Web application (SPA frontend + serverless backend)
**Performance Goals**: Invite page loads in <2s, credit balance updates in <2s after deduction, rate limit: 10 req/min/IP on `getInviteDetails`, post-signin invite-discovery query O(1) on indexed `inviteeEmailNormalized`, Paddle webhook write-through adds ≤1 Firestore query + ≤N writes per event (N = number of dormantPlan snapshots referencing that subscription, typically 0 or 1)
**Constraints**: One-team-per-user model, plan-based seat limits (Starter/Creator: 1, Pro: 3, Scaling: 10), 7-day invite expiry, explicit consent required on every invite-claim path (no silent auto-claim), dormant plan snapshot kept live via Paddle webhook write-through so removal is offline-safe
**Scale/Scope**: 6 Firestore collections (+`pending_plans` coordination), 9 Cloud Functions (added `declineTeamInvite`), 2 frontend pages, 70+ i18n keys (EN+AR), 10 fixture tests (6 original + 4 Phase 8 follow-up: dormantPlan capture/restore, Paddle write-through, Accept/Decline transitions, pendingRemovalToast idempotency)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Reliability Over Feature Count | PASS | Core flow (invite → consent → claim → team) is prioritized as P1. Workspace switching (P6) deferred to Scaling plan only. dormantPlan pattern ensures paying users don't lose their own subscription when joining a team. |
| II. Selected Mode Must Be Obeyed | PASS | Role selection (editor/viewer) at invite time is honored throughout: stored in invite, applied on claim, enforced on actions. Explicit Accept/Decline consent is required on every invite-claim path — no silent auto-claim, even when the sign-in handler discovers a matching invite by email. |
| III. Launch Surface Is Frozen | PASS | Feature scope matches LAUNCH_MATRIX Phase 9 (15 tasks). Three scope additions approved in clarification session 2026-04-04; Phase 8 / 009 follow-up (Session 2026-04-15 two passes) added `declineTeamInvite`, `dormantPlan` capture-and-restore, Paddle webhook write-through, and `pendingRemovalToast` — all driven by upstream Phase 8 changes (Paddle migration, verification gate, mandatory billing modal) and the team-hijack security fix. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 8 user stories with explicit Given/When/Then acceptance scenarios (US1 extended with scenarios 4 and 4a for consent flow, US8 extended from 5 to 10 fixture assertions). FR-004 now specifies device-independent discovery + consent-required claim; FR-017 and FR-018 specify dormantPlan capture and Paddle write-through. |
| V. Arabic Quality Is First-Class | PASS | All 70+ team/join/invite i18n keys have Arabic translations (both EN and AR). New copy required for Accept/Decline buttons, removal toast, and team welcome toast — all must ship with EN+AR from day one. |
| VI. Hidden Machine Layers Must Be Auditable | PASS | `resolveCreditOwner()` traces credit ownership. Invite status lifecycle (pending → sent → accepted \| failed \| revoked \| expired \| declined) is fully tracked with timestamps. `dormantPlan` snapshot is stored on the user doc where it's readable by support. Paddle webhook write-through logs every dormantPlan update alongside the live billingState update. `pendingRemovalToast` is a visible field showing a removed member has a pending explanation. |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | **Security upgrade**: Session 2026-04-15 second pass closed a team-hijack vector introduced by the first pass's device-independent auto-claim. An attacker creating an invite to a stranger's email can no longer silently conscript that user — the post-signin handler now routes to `/join?inviteId=<match>` for explicit consent on every code path. Declining an invite marks it terminal and releases the seat. Viewer blocking still shows a toast; member removal still fires a toast; over-limit warning still displays on the Team page. |
| VIII. Cost Discipline Is Mandatory | PASS | Viewer role prevents credit waste. Plan limits cap team size. Expired invites auto-transitioned on read. Rate limiting prevents abuse of the unauthenticated endpoint. **New**: `dormantPlan` capture prevents double-billing the revenue hole where a paying user joined a team and later lost access to the subscription they were still being billed for — their own Paddle subscription is now restored verbatim on removal. Paddle webhook write-through keeps that snapshot accurate for free (async, non-blocking). Post-signin discovery query is O(1) on an indexed field — negligible read cost. |
| IX. Proof Required for Every Fix | PASS | Fixture tests extended from 6 to 10 assertions covering the new high-blast-radius flows: dormantPlan capture-and-restore round trip (both sources), Paddle webhook write-through to dormantPlan (subscription.updated / subscription.canceled / monthly reset), Accept/Decline status transitions (including seat-release semantics for `declined`), and pendingRemovalToast exactly-once consumption. SC-008 updated from "6 assertions" to "10 assertions". FR-014 enumerates every assertion. |
| X. Spec Before Code | PASS | Spec written and reviewed (2026-04-03 → 2026-04-10), then refreshed in two Phase 8 / 009 follow-up clarification passes (both on 2026-04-15) resolving 10 additional questions before any new code is written. Spec now has 18 functional requirements, 8 success criteria, 10+ edge cases, and 10 fixture assertions. |
| XI. Frontend and Backend Must Agree | PASS | Viewer gating enforced in both layers (client + server). Plan limits enforced in both UI and Cloud Function. **New**: consent flow enforced in both layers — the frontend routes to the Accept/Decline screen, but even if the frontend were bypassed, the backend has no auto-claim code path; `claimTeamInvite` and `declineTeamInvite` are the only two entry points and both require explicit invocation. The mandatory-billing-modal suppression gate (frontend, Phase 8 concern) and `dormantPlan` capture (backend, Phase 9 concern) are separated cleanly by responsibility. |
| XII. Deferred Scope Must Remain Deferred | PASS | Workspace history isolation (US6) is Scaling-plan only and flagged as needing additional integration. Not exposed to non-Scaling plans. The team-hijack security fix was NOT deferred despite being discovered late in clarification — closing a silent-conscription vector before launch is a constitution-level reliability requirement. |

**Gate Result**: PASS — all 12 principles satisfied after Phase 8 / 009 follow-up refinements. The consent-required design (Session 2026-04-15 second pass Q1) specifically upgrades the Principle VII posture vs. the first clarification pass.

## Project Structure

### Documentation (this feature)

```text
specs/006-team-management/
├── spec.md              # Feature specification (reviewed 2026-04-10)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cloud-functions.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── pages/
│   ├── JoinTeam.tsx         # Invite acceptance page (/join?id=...)
│   └── Team.tsx             # Team management modal (owner + member views)
├── components/
│   ├── WorkspaceSwitcher.tsx # Workspace dropdown (Scaling plan)
│   └── WorkspaceSettingsModal.tsx
├── services/
│   └── teamService.ts      # Cloud Function wrappers (8 functions)
├── planconfig.ts            # Plan limits & feature flags
├── i18n.tsx                 # EN + AR translations (70+ team keys)
└── App.tsx                  # Routing, state, credit deduction, team props

functions/
├── src/
│   ├── index.ts             # 9 team Cloud Functions (+ declineTeamInvite) + credit resolution
│   ├── entitlements.ts      # resolveCreditOwner()
│   ├── billing/             # Phase 8 / 009 — Paddle webhooks must write through to dormantPlan
│   └── teamFixtureTests.ts  # 10 fixture test cases (T031–T036 original + T036a–T036d Phase 8 follow-up)
└── package.json

firestore.rules              # Team-aware security rules
firestore.indexes.json       # Adds team_invites.inviteeEmailNormalized + users.dormantPlan.paddleSubscriptionId
```

**Structure Decision**: Existing web application structure (SPA + serverless). Team management is integrated into existing files rather than creating new modules, following the project's single-file-per-concern pattern. Infrastructure changes: one new composite Firestore index on `team_invites` (`inviteeEmailNormalized + status + expiresAt`) for the device-independent discovery query and modal suppression gate. No explicit index is required for the `dormantPlan` write-through query — Firestore auto-creates single-field indexes on nested map subfields, so `.where("dormantPlan.stripeCustomerId", "==", x)` works without configuration.

**Naming note — Stripe vs Paddle**: The spec and plan refer to Paddle fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`) because they look forward to the 009 (Phase 8) Paddle migration. On THIS branch, however, the billing provider is still Stripe — user docs carry `stripeCustomerId`, not `paddleCustomerId`. The implementation of FR-017 (dormantPlan capture), FR-018 (write-through), and the claim/remove restore paths therefore use `stripeCustomerId` as the dormant-plan identity field. When 009 merges, a mechanical rename in `functions/src/index.ts` and `firestore.indexes.json` lines up the code with the Paddle naming. Everything else in the spec's Phase 8 coordination (modal suppression, consent flow, welcome/removal toasts, dormantPlan semantics) is provider-agnostic and needs no migration work.

## Phase 8 / 009 Integration Touchpoints

The Paddle billing code (009) is the authoritative owner of the webhook handlers and the mandatory-billing-modal gate. Phase 9 intersects it in exactly three places — all must land in the same branch so the system is consistent end-to-end:

1. `functions/src/billing/paddleWebhook.ts` (009-owned) MUST add the `dormantPlan` write-through loop in every subscription-mutating handler (`subscription.updated`, `subscription.past_due`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`) AND in the monthly credit reset scheduled function. The loop performs one Firestore query per event against the new `users.dormantPlan.paddleSubscriptionId` index and updates each matching snapshot in place. This is the only Phase 9 change to 009-owned files.
2. `src/components/MandatoryBillingModal.tsx` (009-owned) already implements `isTeamMember: true` suppression per 009 FR-024a. Phase 9 extends its gate logic to ALSO suppress when the post-signin handler's `team_invites` query returns a live match — the boolean is cached once per sign-in in the billing-state hook's context.
3. `src/App.tsx` post-signin handler (shared between 008 onboarding, 009 billing gate, and 009 verification gate) adds a single step: on any sign-in where `users/{uid}` does not yet exist OR `billingState.plan === 'none'`, run the `team_invites`-by-email query and (if it matches) route to `/join?inviteId=<match>`. The handler MUST run this check BEFORE the 009 mandatory billing modal gate fires, so invitees never see the modal even for one frame.

No other 009-owned files are touched by Phase 9. Phase 9's dormantPlan, consent flow, and fixture tests live entirely in 006-owned files.

## Complexity Tracking

> No constitution violations requiring justification. Session 2026-04-15 clarifications (two passes) added surface area — `dormantPlan`, `pendingRemovalToast`, consent flow, Paddle write-through, 4 extra fixture tests — but each addition closes a concrete risk (revenue hole, team-hijack vector, stale snapshot, un-reviewable regression surface). The deltas are additive to the original 15-task scope, not rework.
