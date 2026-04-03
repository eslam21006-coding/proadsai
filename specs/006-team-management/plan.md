# Implementation Plan: Team Management

**Branch**: `006-team-management` | **Date**: 2026-04-03 | **Spec**: [spec.md](./spec.md)
**Input**: Phase 9 from LAUNCH_MATRIX.md (tasks 9.1–9.15)

## Summary

Build the user-facing team management UI and fix the critical 404 bug on invite links. The backend functions already exist — this feature adds: (1) a `/join` route with account creation/login flow, (2) a Team management page for owners, (3) plan limit enforcement, (4) team credit visibility, (5) viewer role gating, and (6) workspace separation for Scaling plans. One new Cloud Function (`getInviteDetails`) is needed.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Auth, React 19
**Storage**: Firestore (`team_invites` collection, `users/{uid}` docs, `users/{uid}/team` subcollection)
**Testing**: Contract fixtures (`npm run test:contracts`)
**Target Platform**: Web — Firebase Hosting + Cloud Functions
**Project Type**: SaaS web application
**Constraints**: No router library — `/join` route detected via `window.location.pathname`. Existing team backend functions reused as-is. Phase 8 (Billing State) is a dependency.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Fixes a critical bug (404). Builds UI on existing backend. |
| II. Selected Mode MUST Be Obeyed | PASS | Team roles (editor/viewer) are respected in all actions. |
| III. Launch Surface Is Frozen | PASS | Team management is in the approved launch matrix (Phase 9). |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Fixture tests verify invite/claim/remove/viewer operations. |
| V. Arabic Quality Is First-Class | PASS | All team UI strings must be in both English and Arabic. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Team state is visible in the billing state listener. |
| VII. No Silent Override | PASS | Member removal shows confirmation dialog. Viewer gating shows tooltip. |
| VIII. Cost Discipline | PASS | Viewer role prevents unauthorized credit spending. |
| IX. Proof Required for Fix | PASS | 404 fix is verifiable by clicking any invite link. |
| X. Spec Before Code | PASS | This plan + spec precedes implementation. |
| XI. Frontend/Backend Must Agree | PASS | Plan limits enforced both in UI (hide form) and backend (reject at limit). |
| XII. Deferred Scope Stays Deferred | PASS | Workspace separation (P6) is explicitly Scaling-plan only. |

## Key Design Decisions

### Join Page Without Router

**Decision**: Detect `/join` from `window.location.pathname` at the top of App.tsx, before the normal auth flow. Render JoinTeam component when matched.

**Rationale**: The app has no router library. Adding one for a single route is too invasive. Path detection is a 3-line check that cleanly short-circuits the normal flow.

**Alternative rejected**: Installing react-router — high risk of breaking existing state-driven navigation.

### Role Terminology: editor vs member

**Decision**: Store `'editor'` in the database (matches existing backend). Display "Member" in the UI.

**Rationale**: The backend already uses `'editor'|'viewer'`. Changing the backend term would require migrating existing data and updating 7 Cloud Functions. The UI label is a presentation concern.

### Unauthenticated Invite Details

**Decision**: `getInviteDetails` does not require auth. The invite ID is a bearer token.

**Rationale**: New users don't have accounts yet when they click the invite link. They can't authenticate before seeing the invite details. The response only exposes non-sensitive fields (owner name, invitee email, plan name).

### Team State via Existing Listener

**Decision**: Extend the existing Firestore user doc listener to expose team state fields. No new listener.

**Rationale**: `isTeamMember`, `teamOwnerUid`, and `teamRole` are already on the user doc. A secondary read for `teamOwnerName` is needed (from the owner's user doc), but this is a one-time read on team member login.

## Project Structure

### Documentation (this feature)

```text
specs/006-team-management/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research
├── data-model.md        # Entity documentation
├── quickstart.md        # Developer quickstart
├── contracts/
│   └── get-invite-details.md  # New endpoint contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code

```text
# New files
src/pages/
├── JoinTeam.tsx           # /join route — invite acceptance page
├── Team.tsx               # Team management page

# Modified files
functions/src/
├── index.ts               # Add getInviteDetails Cloud Function
├── contractFixtures.test.ts # Add team fixture tests

src/
├── App.tsx                # /join route detection, team credit label, viewer gating
├── i18n.tsx               # Team translation strings
```

## Complexity Tracking

No constitution violations to justify — all principles PASS.
