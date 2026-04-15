# Implementation Plan: Team Management

**Branch**: `006-team-management` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-team-management/spec.md`

## Summary

Team Management enables team owners to invite members, manage roles (editor/viewer), enforce plan-based seat limits, share credits from the owner's pool, and gate credit-consuming actions for viewer-role members. The critical fix is the invite acceptance flow (previously 404). The implementation spans 8 Cloud Functions, 2 frontend pages (JoinTeam + Team modal), Firestore security rules, a fixture test suite, and a workspace switcher component for Scaling plan teams.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: React 19, Firebase Cloud Functions v2, Firebase Auth, Firestore, Vite 7, Tailwind CSS 3
**Storage**: Firestore (`team_invites`, `teamMemberships`, `users/{uid}`, `users/{uid}/team`, `rateLimits`)
**Testing**: Custom fixture test runner (`teamFixtureTests.ts`) — `npm run build && node lib/teamFixtureTests.js`
**Target Platform**: Web (SPA), Firebase hosting
**Project Type**: Web application (SPA frontend + serverless backend)
**Performance Goals**: Invite page loads in <2s, credit balance updates in <2s after deduction, rate limit: 10 req/min/IP on `getInviteDetails`
**Constraints**: One-team-per-user model, plan-based seat limits (Starter/Creator: 1, Pro: 3, Scaling: 10), 7-day invite expiry
**Scale/Scope**: 5 Firestore collections, 8 Cloud Functions, 2 frontend pages, 70+ i18n keys (EN+AR), 6 fixture tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Reliability Over Feature Count | PASS | Core flow (invite → claim → team) is prioritized as P1. Workspace switching (P6) deferred to Scaling plan only. |
| II. Selected Mode Must Be Obeyed | PASS | Role selection (editor/viewer) at invite time is honored throughout: stored in invite, applied on claim, enforced on actions. |
| III. Launch Surface Is Frozen | PASS | Feature scope matches LAUNCH_MATRIX Phase 9 (15 tasks). Three scope additions (role selector, role change, invite details fields) were explicitly approved in clarification session 2026-04-04. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 8 user stories with explicit Given/When/Then acceptance scenarios. 6 fixture tests with concrete assertions. |
| V. Arabic Quality Is First-Class | PASS | All 70+ team/join/invite i18n keys have Arabic translations (both EN and AR). |
| VI. Hidden Machine Layers Must Be Auditable | PASS | `resolveCreditOwner()` traces credit ownership. Invite status lifecycle (pending→sent→accepted/failed/revoked/expired) is fully tracked with timestamps. Rate limiting is logged in `rateLimits` collection. |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | Viewer blocking shows toast message. Member removal shows notification. Over-limit warning displayed on Team page. Invite expiry communicated on join page. |
| VIII. Cost Discipline Is Mandatory | PASS | Viewer role prevents credit waste. Plan limits cap team size. Expired invites auto-transitioned on read (no background jobs). Rate limiting prevents abuse of unauthenticated endpoint. |
| IX. Proof Required for Every Fix | PASS | Fixture tests cover 6 core operations with specific assertions. Each test has before/after state validation. |
| X. Spec Before Code | PASS | Spec written and reviewed (2026-04-03 → 2026-04-10). 16 functional requirements, 8 success criteria, 7 edge cases documented. |
| XI. Frontend and Backend Must Agree | PASS | Viewer gating enforced in both layers: client (`deductCredits` returns false + toast) and server (`resolveCreditOwner` throws permission-denied). Plan limits enforced in both UI (form disabled) and Cloud Function (transaction validation). |
| XII. Deferred Scope Must Remain Deferred | PASS | Workspace history isolation (US6) is Scaling-plan only and flagged as needing additional integration. Not exposed to non-Scaling plans. |

**Gate Result**: PASS — all 12 principles satisfied.

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
│   ├── index.ts             # 8 team Cloud Functions + credit resolution
│   ├── entitlements.ts      # resolveCreditOwner()
│   └── teamFixtureTests.ts  # 6 fixture test cases (T031–T036)
└── package.json

firestore.rules              # Team-aware security rules
```

**Structure Decision**: Existing web application structure (SPA + serverless). Team management is integrated into existing files rather than creating new modules, following the project's single-file-per-concern pattern.

## Complexity Tracking

> No constitution violations requiring justification.
