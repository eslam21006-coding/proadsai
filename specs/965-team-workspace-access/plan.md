# Implementation Plan: Team Member Workspace Access

**Branch**: `965-team-workspace-access` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/965-team-workspace-access/spec.md`

## Summary

Team members sign in and see no workspaces. Three independent defects produce that single symptom, and
a fourth would have made a frontend-only fix look successful while delivering nothing:

1. **The workspace effect never re-runs when the account link resolves.** `App.tsx:2405` lists
   `effectiveUidRef.current` in a dependency array; ref mutations do not schedule renders, so the effect
   fires with the member's own uid and stays there.
2. **The empty result triggers workspace creation.** `App.tsx:2377-2391` calls `createWorkspace` when the
   list comes back empty — under a team member that creates a workspace in *their own* account.
3. **The switcher is never told it is serving a team member.** `isTeamMember` is not passed at
   `App.tsx:7303`, so the create button and the edit control stay visible.
4. **The server independently narrows access to a stored per-member workspace list** that is empty for
   every newly invited member (`workspacePolicy.ts:135`, `index.ts:6739`). Fixing only the frontend would
   show the workspaces and find every one of them empty.

The plan fixes the resolution race with an explicit `teamResolution` state, converts the fetch to a live
listener that is torn down when membership ends, grants account-wide access on the server for any verified
member, withholds create/edit/delete from team members in both layers, and replaces the misleading
"ask your team owner" copy. Two adjacent wrong-account writes found during research are corrected because
they write a team member's data into the wrong place.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (Cloud Functions)
**Primary Dependencies**: React 19, Zustand 4, Tailwind CSS 3, Vite 7 (frontend); Firebase Cloud Functions v2, Firebase Admin SDK, Firestore (backend)
**Storage**: Firestore — `users/{uid}/workspaces/{id}`, `users/{ownerUid}/team/{memberDocId}`, `users/{uid}` (reads only; **no schema change, no migration**)
**Testing**: Node `assert/strict` pure-function suites under `functions/src/__tests__/`, registered in `functions/package.json`; frontend verified through the `quickstart.md` manual matrix (no frontend test runner in this project)
**Target Platform**: Browser (Vite SPA) + Cloud Functions v2 in `europe-west1`
**Project Type**: Web application — React frontend (`src/`) + Firebase Functions backend (`functions/`)
**Performance Goals**: usable workspace within 5 s of sign-in (SC-001); owner-side changes visible to members within 10 s (SC-006, SC-010)
**Constraints**: no Firestore rules change; no schema migration; owner behaviour must be bit-for-bit unchanged (SC-007); every user-visible string in both `ar` and `en` (FR-018); PowerShell command syntax; lazy `getDb()` — never `admin.firestore()` at module top level
**Scale/Scope**: < 50 workspaces and < 50 team members per account; ~6 frontend files, ~4 backend files, 1 inverted test suite, 1 new test suite

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Result: **PASS** (1 justified deviation).*

| Principle | Assessment |
|---|---|
| I — Reliability over feature count | **Pass.** Role-based editing was split out in clarification so the blocking fix stays narrow. |
| II — Selected mode obeyed | **Pass.** The selected workspace now governs what is read and written; today's silent drift into the wrong account is the defect being removed. |
| III — Launch surface frozen | **Pass.** No new surface. One owner-facing control is withdrawn (FR-020). |
| IV — Behavior contracts beat judgment | **Pass.** `contracts/` states pass/fail rules for each decision point. Includes the deliberate inversion of an existing contract (D1). |
| V — Arabic first-class | **Pass, with a defect to repair.** `App.tsx:11269-11271` hardcodes English in the removed-from-team overlay. Keyed and translated as part of this work. |
| VI — Hidden layers auditable | **Pass.** FR-023 logging covers refusals; FR-004b covers the access-policy override. |
| VII — No silent override without rule, signal, trace | **Pass by remedy.** Ignoring a stored `workspaceAccess` array *is* an override. Rule: FR-004/FR-004a. Trace: FR-004b log line. Signal to user: not applicable — the member's experience is strictly more access, and the owner's control is withdrawn rather than left lying. |
| VIII — Cost discipline | **Pass.** No additional model calls. Replaces one `getDocs` with one `onSnapshot`. |
| IX — Proof for every claimed fix | **Pass.** Each defect carries file, line, cause, change, and a `quickstart.md` before/after check. |
| X — Spec before code | **Pass.** Spec + 5 clarifications + research precede implementation. |
| XI — Frontend and backend agree | **Pass by remedy.** The D1 finding is exactly a frontend/backend disagreement about who may see what. Both layers are changed together; neither ships alone. |
| XII — Deferred scope stays deferred | **Pass.** Editing stays withheld from all roles until the follow-up spec. |

**Deviation requiring justification**: an existing behaviour contract is inverted — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/965-team-workspace-access/
├── spec.md                  # Feature specification (5 clarifications integrated)
├── investigation-notes.md   # Code-level findings from /speckit.specify
├── research.md              # Phase 0 output — D1..D9 decisions
├── plan.md                  # This file
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output — manual verification matrix
├── contracts/
│   ├── workspace-access.md      # Server access-resolution contract
│   ├── workspace-mutations.md   # create / update / delete refusal contract
│   └── frontend-workspace-ui.md # Switcher, modal, team screen, loading gate
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md                 # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/                                   # React frontend
├── App.tsx                            # teamResolution state; live workspace listener;
│                                      #   switcher props; remove auto-create; workspaceReady
│                                      #   gate; effectiveUid fix at :5519; overlay i18n
├── components/
│   ├── WorkspaceSwitcher.tsx          # isTeamMember prop consumed; edit control withheld
│   └── WorkspaceSettingsModal.tsx     # delete control withheld from team members
├── pages/
│   └── Team.tsx                       # workspace access matrix removed
└── i18n.tsx                           # new + corrected keys, `en` and `ar`

functions/src/                         # Cloud Functions (europe-west1)
├── workspaces/
│   └── workspacePolicy.ts             # resolveCallerScope → ALL for members;
│                                      #   new assertNotTeamMember() guard
├── savedProjects/
│   └── getUserProjects.ts             # consumes the widened scope (no logic change expected)
├── index.ts                           # guards on create/update/delete/restoreWorkspace;
│                                      #   getWorkspaceGenerations access check widened
└── __tests__/
    ├── savedProjects.getUserProjects.test.ts   # existing contract inverted (D1)
    └── teamWorkspaceAccess.test.ts             # NEW — access + refusal decision tables

firestore.rules                        # UNCHANGED — read access already correct (:41-48)
```

**Structure Decision**: Existing two-part web-application layout (`src/` + `functions/`). No new
directories. The feature is a defect repair across established files, so every change lands in the file
that already owns the behaviour rather than in a new module. The one new backend file is a test suite.

## Implementation Phases

Ordered so the backend truth lands before the frontend starts relying on it — Constitution XI. Each
phase builds and tests green before the next begins.

**Phase A — Server access truth (blocking; must deploy before the frontend is useful)**
`resolveCallerScope` grants `"ALL"` to any verified member, with the FR-004b override log.
`getWorkspaceGenerations` drops the per-workspace narrowing and keeps the membership check.
Invert the existing `getUserProjects` contract test; add the new decision-table suite.

**Phase B — Server mutation guards**
`assertNotTeamMember()` in `workspacePolicy.ts`; applied to `createWorkspace`, `updateWorkspace`,
`deleteWorkspace`, `restoreWorkspace` with the FR-023 refusal log.

**Phase C — Frontend resolution and live list**
`teamResolution` state; workspace effect keyed on state not ref; `onSnapshot` with teardown; remove the
auto-create fallback; same dependency repair for the avatars effect; `workspaceLoadError` handling.

**Phase D — Frontend permissions and copy**
Switcher `isTeamMember` prop and withheld edit control; modal delete withheld; Team screen matrix
removed; `workspaceReady` write-gate; `effectiveUid` fix at `App.tsx:5519`; all i18n keys in both
locales including the overlay repair and the retired "ask your team owner" string.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Inverting an existing behaviour contract — `savedProjects.getUserProjects.test.ts:26` asserts a team member with empty `workspaceAccess` is **denied**; it must now be **allowed** | FR-004 makes access all-or-nothing per account. The old contract encodes the per-workspace model the product decision replaced. Leaving it would mean the test suite defends the behaviour that causes ISSUE-D | Backfilling every member's `workspaceAccess` with all workspace ids would keep the old contract passing, but it is a data migration that re-breaks the moment the owner creates a workspace, and it writes authority into a field FR-021 requires be left unread |
| Backend change inside a fix framed as frontend wiring | The server narrows access to a stored per-member list that is empty for every new member (`workspacePolicy.ts:135`, `index.ts:6739`). Without this, the picker fills and every workspace reads as empty | A frontend-only fix was the original plan and was rejected on evidence — it would have shipped a blocker that appeared fixed. Recorded in `research.md` D1 |
