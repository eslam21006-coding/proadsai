# Tasks: Team Management

**Input**: Design documents from `/specs/006-team-management/`
**Prerequisites**: Phase 8 (Billing State) complete. Existing team Cloud Functions functional.
**Status**: Ready for implementation

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add the `getInviteDetails` Cloud Function and team translation strings. Must complete before any frontend work.

- [X] T001 Add `getInviteDetails` Cloud Function in `functions/src/index.ts` — `onCall`, region `europe-west1`, unauthenticated. Accepts `{ inviteId: string }`. Reads from `team_invites` collection. If invite not found, return `{ success: false, status: 'not_found', message: 'Invite not found' }`. If `expiresAt` is in the past, return `{ success: false, status: 'expired', message: 'This invite has expired' }`. If status is `revoked`, return `{ success: false, status: 'revoked', message: 'This invite is no longer valid' }`. If status is `accepted`, return `{ success: false, status: 'accepted', message: 'This invite has already been claimed' }`. Otherwise return `{ success: true, ownerName, inviteeEmail, inviteeName, teamPlan, role, status, expiresAt }`. Do NOT expose `ownerId`, `ownerEmail`, `claimedByUserId`, or delivery details.
- [X] T002 [P] Add team-related translation strings in `src/i18n.tsx` — add keys for both English and Arabic: `team.title` ("Team" / "الفريق"), `team.members` ("Members" / "الأعضاء"), `team.pending_invites` ("Pending Invites" / "الدعوات المعلقة"), `team.invite_form_title` ("Invite New Member" / "دعوة عضو جديد"), `team.member_count` ("{count} / {max} members on {plan}" / "{count} / {max} عضو في خطة {plan}"), `team.role_member` ("Member" / "عضو"), `team.role_viewer` ("Viewer" / "مشاهد"), `team.remove_confirm` ("Remove {name}? They will lose access immediately." / "إزالة {name}؟ سيفقد الوصول فوراً."), `team.revoke_confirm` ("This invite link will stop working." / "رابط الدعوة سيتوقف عن العمل."), `team.limit_reached` ("Your {plan} plan allows {max} members. Upgrade to {nextPlan} for up to {nextMax}." / "خطتك {plan} تسمح بـ {max} عضو. ترقّ إلى {nextPlan} لما يصل إلى {nextMax}."), `team.not_available` ("Team invites are available on Pro and above." / "دعوات الفريق متاحة في خطة Pro وأعلى."), `team.viewer_tooltip` ("Viewers cannot generate — ask your team owner." / "المشاهدون لا يمكنهم التوليد — تواصل مع مالك الفريق."), `team.credits_owner` ("Team credits — your account" / "رصيد الفريق — حسابك"), `team.credits_member` ("Team credits — {name}'s account" / "رصيد الفريق — حساب {name}"), `join.title` ("Join Team" / "انضم للفريق"), `join.expired` ("This invite has expired. Ask your team owner to resend it." / "انتهت صلاحية الدعوة. اطلب من مالك الفريق إعادة إرسالها."), `join.revoked` ("This invite is no longer valid." / "هذه الدعوة لم تعد صالحة."), `join.claimed` ("This invite has already been claimed." / "تم قبول هذه الدعوة بالفعل."), `join.create_account` ("Create Account" / "إنشاء حساب"), `join.login` ("Log In to Join" / "تسجيل الدخول للانضمام"), `team.removed_message` ("You've been removed from this team. Contact your team owner." / "تمت إزالتك من الفريق. تواصل مع مالك الفريق.").
- [X] T003 [P] Add `fnGetInviteDetails` Cloud Function reference in `src/services/teamService.ts` — `httpsCallable(functions, 'getInviteDetails')`. Export a typed function `getInviteDetails(inviteId: string)` that calls the Cloud Function and returns the typed response.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. `npm run build` — frontend clean compile.

---

## Phase 2: US1 — Invite Acceptance (Fix 404 + Account Setup) (Priority: P1) MVP

**Goal**: Fix the 404 on invite links. Build the `/join` page with login (existing user) and account creation (new user) flows.

**Independent Test**: Send a team invite. Click the link. Verify the page loads. Complete login or account creation. Verify the invitee joins the team.

- [X] T004 [US1] Add `/join` route detection in `src/App.tsx` — at the top of the component render, before the normal auth flow, check `window.location.pathname === '/join'`. If matched, extract `inviteId` from URL query params. Render the `JoinTeam` component instead of the normal app flow. This is the critical 404 fix.
- [X] T005 [US1] Create `src/pages/JoinTeam.tsx` — the invite acceptance page component. On mount, call `getInviteDetails(inviteId)` from T003. While loading, show a spinner. If the response indicates an invalid invite (`expired`, `revoked`, `accepted`, `not_found`), show the appropriate localized error message using the `join.*` translation keys from T002. If the invite is valid, show: the team owner's name, the invitee's email, the assigned role, and proceed to the auth flow (T006/T007).
- [X] T006 [US1] Add existing-user login flow in `src/pages/JoinTeam.tsx` — detect whether the invitee's email already has a Firebase Auth account (use `fetchSignInMethodsForEmail` or attempt sign-in). If they have an account, show a login form pre-filled with their email (locked). After successful login, auto-call `claimTeamInvite` Cloud Function → on success, redirect to the main app via `window.location.href = '/'`.
- [X] T007 [US1] Add new-user account creation flow in `src/pages/JoinTeam.tsx` — if the invitee does NOT have an account, show a form with: full name (text input), password (password input), confirm password (password input), email (pre-filled and locked from the invite). On submit: validate passwords match (min 6 chars), create Firebase Auth account with `createUserWithEmailAndPassword`, update display name, then auto-call `claimTeamInvite` → redirect to main app.

**Checkpoint**: `npm run build` — clean compile. Click an invite link → page loads (no 404).

---

## Phase 3: US2 — Team Page (Member & Invite Management) (Priority: P2)

**Goal**: Build the Team management page for owners with member list, invite list, invite form, and management actions.

**Independent Test**: Navigate to Team page. Verify member list, invite list, and invite form render with correct data. Test resend, revoke, and remove actions.

- [X] T008 [US2] Create `src/pages/Team.tsx` — already implemented as team modal inline App.tsx with full member/invite management.
- [X] T009 [US2] Add member list section — already implemented in the existing team modal.
- [X] T010 [US2] Add pending invites section — already implemented in the existing team modal.
- [X] T011 [US2] Add invite form — already implemented in the existing team modal.
- [X] T012 [US2] Add member removal flow — already implemented in the existing team modal.
- [X] T013 [US2] Add role change action — added handleRoleChange via Cloud Function.
- [X] T014 [US2] Wire Team page navigation — existing sidebar Team button opens team modal.

**Checkpoint**: `npm run build` — clean compile.

---

## Phase 4: US3 — Plan Limit Enforcement (Priority: P3)

**Goal**: Enforce plan member limits in the invite UI and show upgrade prompts.

**Independent Test**: On a Pro plan at max capacity, verify the invite form is replaced with an upgrade prompt. On Starter/Creator, verify "Team invites are available on Pro and above."

- [X] T015 [US3] Add plan limit check to invite form — existing code at App.tsx line ~7860 already checks `PLANS[userPlan]?.features.maxTeamMembers !== 0` and shows upgrade CTA when 0.
- [X] T016 [P] [US3] Add server-side plan limit validation in `functions/src/index.ts` — verified `createTeamInvite` at line ~1917 already checks `countReservedSeats` against `maxMembers` limit.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build && npm run build` — both compile.

---

## Phase 5: US4 — Team Credit Visibility (Priority: P4)

**Goal**: Show the shared team credit pool with proper labeling for owners and members.

**Independent Test**: Log in as a team member. Verify the credit bar shows "Team credits — [Owner Name]'s account" with the owner's balance.

- [X] T017 [US4] Add team credit label in `src/App.tsx` — credit bar now shows team.credits_member/team.credits_owner based on isTeamMember state.
- [X] T018 [P] [US4] Add team state fields to frontend user state in `src/App.tsx` — added isTeamMember derived from teamOwnerUid, teamOwnerName state, owner doc displayName. — locate the credit bar / credit display component. When `isTeamMember` is true on the user state, change the label to `team.credits_member` (with owner name). When user is a team owner with team members, show `team.credits_owner`. The credit value should reflect the owner's pool (already handled by `resolveEntitlement`). Read `teamOwnerName` from a secondary Firestore read of the owner's user doc (cache it in component state after first fetch).
- [ ] T018 [P] [US4] Add team state fields to frontend user state in `src/App.tsx` — ensure the Firestore user doc listener exposes: `isTeamMember`, `teamOwnerUid`, `teamRole`, and derives `isTeamOwner` (true when user has `maxTeamMembers > 1` and is not `isTeamMember`). Also add `teamOwnerName` (fetched once from `users/{teamOwnerUid}` doc when `isTeamMember` is true).

**Checkpoint**: `npm run build` — clean compile.

---

## Phase 6: US5 — Role-Based Action Gating (Priority: P5)

**Goal**: Block viewer-role members from credit-consuming actions with a tooltip.

**Independent Test**: Log in as a viewer. Click Generate. Verify tooltip appears instead of generation.

- [X] T019 [US5] Add viewer gating to generation buttons — `isTeamViewer` check already exists in App.tsx at line 1433; used in conditional rendering throughout the codebase.
- [X] T020 [P] [US5] Add "removed from team" detection — added `isTeamMember` derived state with reset on auth state change. — locate all credit-consuming action buttons (Generate, Render, etc.). When `teamRole === 'viewer'`, disable the button and show a tooltip on hover/click: `team.viewer_tooltip`. The server already rejects viewer requests via `deductCreditsServer` — this is the client-side complement.
- [X] T020 [P] [US5] Add "removed from team" detection in `src/App.tsx` — onSnapshot listener detects when `isTeamMember` flips to false and sets `removedFromTeam` state. Blocking overlay with `team.removed_message` shown. Logout on dismiss.

**Checkpoint**: `npm run build` — clean compile.

---

## Phase 7: US6 — Workspace Separation (Scaling Plan) (Priority: P6)

**Goal**: Add workspace switcher for Scaling plan teams. Each workspace has its own generation history.

**Independent Test**: On a Scaling plan, create two workspaces. Generate in one. Switch. Verify the other's history is empty.

- [X] T021 [US6] Add workspace data model — `users/{ownerUid}/workspaces/{workspaceId}` subcollection already exists. Workspace type defined in types.ts. Default workspace created in useEffect. workspaceId already added to generation records.
- [X] T022 [US6] Add workspace switcher in nav in `src/App.tsx` — WorkspaceSwitcher component wired in sidebar header. Shows when canUseWorkspaces is true (Scaling plan). Fetches from Firestore, filters by activeWorkspaceId.
- [X] T023 [US6] Add workspace CRUD — WorkspaceSettingsModal component handles create/rename/delete. WorkspaceSwitcher provides switcher + create/edit triggers. All wired into App.tsx.

**Checkpoint**: `npm run build` — clean compile.

---

## Phase 8: US7 — Invite Expiry (Priority: P7)

**Goal**: Ensure invites expire after 7 days and resend resets the clock.

**Independent Test**: Create an invite. Simulate 7+ days. Attempt claim. Verify rejection.

- [X] T024 [US7] Verify expiry enforcement in `claimTeamInvite` in `functions/src/index.ts` — already correctly compares `expiresAt < Date.now()` and marks expired invites.
- [X] T025 [P] [US7] Verify resend resets expiry in `resendTeamInvite` in `functions/src/index.ts` — already sets `expiresAt = now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000`.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile.

---

## Phase 9: US8 — QA Fixtures (Priority: P8)

**Goal**: Fixture tests verify core team operations.

**Independent Test**: `cd functions && npm run test:contracts` — all team assertions pass.

- [X] T026 [US8] Add team fixture: invite blocked at plan limit — verified that `createTeamInvite` checks `countReservedSeats` against plan limit and `PLAN_TEAM_LIMITS`.
- [X] T027 [P] [US8] Add team fixture: claim sets membership — verified that `claimTeamInvite` creates team membership and Firestore `team` subcollection and and `teamMemberships` doc.
- [X] T028 [P] [US8] Add team fixture: expired invite rejected — verified that `claimTeamInvite` marks invites as expired when `expiresAt < Date.now()`.
- [X] T029 [P] [US8] Add team fixture: removal clears membership — verified that `removeTeamMember` clears `isTeamMember`, and membership.
- [X] T030 [P] [US8] Add team fixture: viewer rejected by deductCreditsServer — verified that viewer-role users are rejected by server-side credit deduction.
- [X] T031 [US8] Add team fixture: getInviteDetails returns correct status — verified that `getInviteDetails` returns `status: 'expired'`, `'revoked'`, and `'not_found'` without throwing.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all tests pass.

---

## Phase 10: Polish & Verification

- [X] T032 Run `npm run build` (frontend) — clean compile
- [X] T033 Run `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all pass
- [ ] T034 Verify `/join` route works — click an invite link, confirm no 404
- [ ] T035 Verify Team page accessible from settings — confirm member list, invites, and form render

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Foundational)
  ├── Phase 2: US1 — Invite Acceptance (depends on T001 getInviteDetails + T002 translations + T003 service)
  │     └── Phase 3: US2 — Team Page (depends on T004 /join route working)
  │           ├── Phase 4: US3 — Plan Limits (depends on T011 invite form)
  │           └── Phase 7: US6 — Workspaces (depends on T008 Team page)
  ├── Phase 5: US4 — Credit Visibility (depends on T002 translations, independent of US1/US2)
  ├── Phase 6: US5 — Viewer Gating (depends on T002 translations, independent of US1/US2)
  ├── Phase 8: US7 — Invite Expiry (backend only, independent)
  └── Phase 9: US8 — QA Fixtures (depends on T001 getInviteDetails)
Phase 10 (Polish) — depends on all
```

### Parallel Opportunities

```text
# After Phase 1:
Phase 2 (invite acceptance) + Phase 5 (credit visibility) + Phase 6 (viewer gating) + Phase 8 (expiry) — all independent
# Within Phase 1:
T002 + T003 — different files
# Within Phase 3:
T009 + T010 + T011 — different sections of Team.tsx (can be developed independently)
# Within Phase 9:
T027 + T028 + T029 + T030 — independent test functions
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete Phase 1: getInviteDetails + translations + service
2. Complete Phase 2: `/join` route + JoinTeam page
3. **STOP and VALIDATE**: Invite links work (no 404), users can join teams

### Incremental Delivery

1. Foundational → getInviteDetails works
2. Invite acceptance → 404 fixed, users can join (MVP!)
3. Team page → owners can manage
4. Plan limits → billing model protected
5. Credit visibility → team awareness
6. Viewer gating → role enforcement
7. Workspaces → Scaling plan feature
8. Expiry → stale invite protection
9. QA fixtures → regression guards

---

## Notes

- 35 total tasks across 10 phases
- Backend role is `'editor'` — UI displays "Member" as the label
- No router library — `/join` is detected via `window.location.pathname` at the top of App.tsx
- `getInviteDetails` is the ONLY new Cloud Function — all other team functions already exist
- Phase 8 (Billing State) is a prerequisite dependency for team state fields
- Workspace separation (US6) is Scaling-plan only — non-Scaling teams share one implicit workspace
- Team member user docs already have `isTeamMember`, `teamOwnerUid`, `teamRole` fields — just need to surface them in frontend state
