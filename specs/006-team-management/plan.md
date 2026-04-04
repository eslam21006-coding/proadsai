# Implementation Plan: Team Management

**Branch**: `006-team-management` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-team-management/spec.md`

## Summary

Build the user-facing team management UI on top of existing backend Cloud Functions. Fix the critical 404 on invite acceptance by adding a `/join` route. Add one new Cloud Function (`getInviteDetails` with IP rate limiting). Build the Team management page with invite/resend/revoke/remove/role-change flows, plan limit enforcement, team credit visibility, viewer role gating, and workspace separation for Scaling plans.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Auth, React 19, Zustand, Tailwind CSS 3, Vite 7
**Storage**: Firestore (`team_invites` collection, `users/{uid}` docs, `users/{uid}/team` subcollection, `users/{uid}/workspaces/{workspaceId}` for Scaling)
**Testing**: Contract fixtures (`npm run test:contracts` in functions/)
**Target Platform**: Web — Firebase Hosting + Cloud Functions (europe-west1)
**Project Type**: Web application (SPA frontend + serverless backend)
**Performance Goals**: Team credit updates visible within 2 seconds of any action (SC-006)
**Constraints**: No router library — `/join` detected via `window.location.pathname`. `getInviteDetails` rate-limited to 10 req/min/IP.
**Scale/Scope**: Max 10 members per team (Scaling plan). 8 user stories, 14 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Reliability Over Feature Count | PASS | Building on 7 existing Cloud Functions. Only 1 new function. Scope is bounded by LAUNCH_MATRIX Phase 9. |
| II | The Selected Mode MUST Be Obeyed | PASS | Role selection (editor/viewer) at invite time is stored and obeyed. UI label "Member" maps to stored "editor". |
| III | Launch Surface Is Frozen and Authoritative | PASS | All 15 LAUNCH_MATRIX tasks covered. 3 confirmed scope additions are minimal extensions (role selector, role change, extra response fields). |
| IV | Behavior Contracts Beat Subjective Judgment | PASS | `getInviteDetails` contract fully defined. 6 fixture test assertions defined. All acceptance scenarios have pass/fail criteria. |
| V | Arabic Quality Is First-Class | PASS | All UI strings have English + Arabic translations via `i18n.tsx`. 16+ translation keys planned. |
| VI | Hidden Machine Layers MUST Be Auditable | PASS | All team operations go through Cloud Functions with Firestore audit trail (status transitions, timestamps). Rate limiting logged. |
| VII | No Silent Override Without Rule, Signal, and Trace | PASS | Email mismatch shows explicit message. Plan limit shows upgrade prompt. Viewer gating shows tooltip. Removed member sees removal message. |
| VIII | Cost Discipline Is Mandatory | PASS | No unnecessary API calls. Frontend checks email mismatch before attempting claim. Rate limiting prevents abuse of unauthenticated endpoint. |
| IX | Proof Is Required for Every Claimed Fix | PASS | 6 fixture tests provide before/after evidence. The 404 fix is directly testable (invite link → working page). |
| X | Spec Before Code | PASS | Full spec with 8 user stories, 14 FRs, 8 success criteria, 7 edge cases, and 5 clarification sessions completed. |
| XI | Frontend and Backend MUST Agree on Truth | PASS | Plan limits enforced both in `createTeamInvite` (server) and invite form (client). Viewer gating in both `deductCreditsServer` (server) and UI (client). Email matching in both `claimTeamInvite` (server) and join page (client). |
| XII | Deferred Scope MUST Remain Deferred | PASS | Workspace separation (US6/P6) is explicitly Scaling-plan only. No router library addition. No new auth mechanisms beyond existing Firebase Auth. |

**Gate result**: ALL PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/006-team-management/
├── plan.md              # This file
├── research.md          # Phase 0 output (9 research decisions)
├── data-model.md        # Phase 1 output (5 entities)
├── quickstart.md        # Phase 1 output (developer reference)
├── contracts/
│   └── get-invite-details.md  # getInviteDetails contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── pages/
│   ├── JoinTeam.tsx          # NEW — Invite acceptance page
│   └── Team.tsx              # NEW — Team management page
├── services/
│   └── teamService.ts        # NEW — Cloud Function call wrappers
├── App.tsx                    # MODIFY — /join route detection, team credit label, viewer gating
└── i18n.tsx                   # MODIFY — team translation strings (EN + AR)

functions/
├── src/
│   ├── index.ts               # MODIFY — add getInviteDetails (with rate limiting), workspace CRUD (Scaling only)
│   └── contractFixtures.test.ts  # MODIFY — add 6 team fixture tests
```

**Structure Decision**: Frontend follows existing pattern (pages/ for full-page components, services/ for backend call wrappers). Backend adds to the existing monolithic `index.ts` (consistent with all other Cloud Functions). No new directories beyond `src/pages/` and `src/services/`.

## Key Design Decisions

### 1. Join Page Without Router

Detect `/join` from `window.location.pathname` at the top of `App.tsx` render flow. If path starts with `/join`, render `<JoinTeam />` instead of the normal auth/app flow. This is a 3-line check that avoids installing react-router.

### 2. Role Terminology: Editor vs Member

Store `'editor'` in Firestore (matches existing data). Display "Member" in the UI. The `updateTeamMemberRole` function already exists and accepts `'editor' | 'viewer'`.

### 3. Unauthenticated Invite Details with Rate Limiting

`getInviteDetails` requires no auth (new users don't have accounts yet). Rate-limited to 10 req/min/IP via Firestore counter keyed by `request.rawRequest.ip`. Returns `not_found` for missing invites (no existence leakage).

### 4. Email Mismatch — Frontend + Backend

Backend already enforces email matching in `claimTeamInvite` (line 2163). Frontend adds a UX check: compare logged-in user's email to `inviteeEmail` from `getInviteDetails` response. If mismatch, show message before they attempt to claim.

### 5. Team State via Existing Listener

Extend the existing Firestore user doc listener to expose team fields (`isTeamMember`, `teamOwnerUid`, `teamRole`). Derive `isTeamOwner` from `maxTeamMembers > 1` on the user doc (all plans with team capacity set this field). For `teamOwnerName` and `teamMemberCount`, secondary reads from the owner's doc or team subcollection count.

### 6. Role Change on Team Page

Use existing `updateTeamMemberRole` Cloud Function. Team page member list includes a role dropdown/toggle per member. Changing triggers the function which atomically updates 3 Firestore locations.

### 7. Empty State for Team Page

When a new team owner (Pro/Scaling) has zero members and zero pending invites, the Team page shows: "You haven't invited anyone yet. Add your first team member below." with the invite form prominently displayed.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.
