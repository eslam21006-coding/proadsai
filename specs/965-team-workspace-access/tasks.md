---

description: "Task list for 965-team-workspace-access"
---

# Tasks: Team Member Workspace Access

**Input**: Design documents from `/specs/965-team-workspace-access/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks below are **required, not optional**. Two reasons: (a) `research.md` D1 establishes
that an existing behaviour contract must be deliberately inverted — leaving it would keep the suite
defending the bug and would fail the build gate; (b) Constitution IV requires explicit pass/fail rules
for high-risk combinations and Constitution IX requires proof for every claimed fix. Frontend has no
test runner in this project, so frontend verification is the `quickstart.md` matrix.

**Organization**: Grouped by user story. US1 and US2 are both P1 and ship together; US3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 — maps to spec.md user stories
- Exact file paths included in every task

## Path Conventions

Web application per plan.md: React frontend at `src/`, Cloud Functions backend at `functions/src/`.
All commands are PowerShell (`;` not `&&`). Functions deploy to `europe-west1`.

---

## Phase 1: Setup

**Purpose**: Baseline evidence and test scaffolding

- [ ] T001 Capture pre-change baseline required by Constitution IX — run the `Run-Step` fail-fast wrapper from `specs/965-team-workspace-access/quickstart.md` over the four gate commands (functions build, functions test, frontend build, frontend lint) and record the output under the "Baseline (before)" heading. **Do not chain the commands with bare `;`** — PowerShell continues past a failed native command, so a later step would mask a failed build and the baseline would record a green gate that never happened
- [ ] T002 [P] Create empty test suite `functions/src/__tests__/teamWorkspaceAccess.test.ts` with the standard header comment and a `run()` stub, and register it in the `test` script of `functions/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Resolve the account link deterministically. Every user story reads this state — US1 to know
whose workspaces to fetch, US2 to know whether to withhold controls, US3 to know when to close the
listener.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Add `teamResolution: 'pending' | 'resolved'` state in `src/App.tsx` near the existing team state (`:2213-2219`); set `'resolved'` on **both** branches of the membership check at `:1737` (team-member branch) and `:1756` (plain-user branch), and on the live user-doc listener path at `:1928`; reset to `'pending'` when `user` changes or on sign-out
- [ ] T004 Repair the ref-in-dependency-array defect in `src/App.tsx` — change the workspaces effect (`:2367-2405`) and the avatars effect (`:1962-1977`) to depend on `[user, effectiveUid, teamResolution, canUseWorkspaces]` using the **state** value `effectiveUid` (`:2218`) rather than `effectiveUidRef.current`, and return early while `teamResolution === 'pending'`
- [ ] T005 Derive `workspaceReady` and add `workspaceLoadError` state in `src/App.tsx` per `data-model.md` — `workspaceReady = teamResolution === 'resolved' && (!canUseWorkspaces || activeWorkspaceId != null)`

**Checkpoint**: Membership resolution is observable state. Non-team users must reach `'resolved'` too —
verify a solo account still loads workspaces before proceeding.

---

## Phase 3: User Story 1 - Team member sees and switches between the account's workspaces (Priority: P1) 🎯 MVP

**Goal**: A team member signs in, sees every active workspace of the account that invited them, switches
between them, and finds each one populated with that account's work.

**Independent Test**: Sign in as Member-E (role `editor`, `workspaceAccess` left empty). Confirm all 3 of
the owner's active workspaces are listed, the deleted one is absent, switching re-scopes saved projects
and audience profiles, and each workspace contains the owner's projects and generated ads.

**⚠️ Server tasks T006–T008 must be deployed before the frontend tasks can be verified** — the old server
returns nothing for a member regardless of how correct the frontend is.

### Server — access truth (contracts/workspace-access.md)

- [ ] T006 [US1] Change `resolveCallerScope` in `functions/src/workspaces/workspacePolicy.ts:116-156` to return `allowedWorkspaceIds: "ALL"` for a caller with a verified member doc under the owner (row A2/A3/A4); keep the membership proof at `:128-133`, keep the no-member-doc denial at `:138` (row A5), and keep the read-failure self-scope at `:154` (row A8)
- [ ] T007 [US1] Add the FR-004b override trace in `functions/src/workspaces/workspacePolicy.ts` — emit `issue-d ▸ workspaceAccess ignored (all-access policy) — caller=<uid> owner=<uid> stored=<count> granted=ALL` only when the stored array was non-empty (row A9), never for the ordinary empty case
- [ ] T008 [US1] Remove the per-workspace narrowing in `getWorkspaceGenerations` at `functions/src/index.ts:6739` while keeping the membership lookup at `:6730-6737` and the `assertWorkspaceActive` call at `:6725`
- [ ] T009 [US1] Invert the superseded contract in `functions/src/__tests__/savedProjects.getUserProjects.test.ts` — the empty-`workspaceAccess` case at `:26-32` becomes **allowed** and the partial-access cases at `:34-47` collapse into the all-access rule; add a comment citing `research.md` D1 and the spec Clarifications so the change reads as a product decision, not a broken test
- [ ] T010 [P] [US1] Add access decision-table cases A1–A9 from `specs/965-team-workspace-access/contracts/workspace-access.md` to `functions/src/__tests__/teamWorkspaceAccess.test.ts`, including the A5 no-member-doc denial and the A6 wrong-owner denial

### Frontend — visibility and switching (contracts/frontend-workspace-ui.md)

- [ ] T011 [US1] Point the workspace fetch in `src/App.tsx:2370-2404` at `users/{effectiveUid}/workspaces`, ordered by `createdAt desc`, filtering `deletedAt == null` client-side
- [ ] T012 [US1] Remove the auto-create fallback at `src/App.tsx:2377-2391` for team members so no workspace is ever created on a member's behalf (FR-013); the owner's own bootstrap path must remain intact
- [ ] T013 [US1] Pass `isTeamMember={teamResolution === 'resolved' && teamOwnerUid != null}` to `WorkspaceSwitcher` at `src/App.tsx:7303-7305`; do **not** pass `workspaceAccess` — leaving it `undefined` is what makes the filter at `WorkspaceSwitcher.tsx:43-45` show all workspaces
- [ ] T014 [US1] Make the empty and error states reachable, then implement them. **First** relax the render guard at `src/App.tsx:7303` from `canUseWorkspaces && workspaces.length > 0` to `canUseWorkspaces && teamResolution === 'resolved'` — today the switcher does not mount when the list is empty, so any message placed inside it for the zero-workspace case is dead code; the `teamResolution` half of the new guard prevents a flash of an empty picker during the resolution window. **Then** add `loadError` and `onRetryLoad` props to `src/components/WorkspaceSwitcher.tsx` and implement U3 (account has no workspace yet) and U5 (could not load, with manual retry per `research.md` D8) at `:125-128`. Also correct the collapsed-button label at `:93-95`, which falls back to `t('workspace.switcher.default_name')` ("Default Workspace") and would name a workspace that does not exist when the list is empty
- [ ] T015 [P] [US1] Retire `workspace.error.no_access` and add the U3/U5 message keys in `src/i18n.tsx` for **both** `en` (near `:823`) and `ar` (near `:1692`) — the current string tells the member to ask the owner for access, which FR-019a forbids
- [ ] T016 [US1] Gate every workspace write on `workspaceReady` in `src/App.tsx` — withhold the Generate action, `saveCurrentProject`, and avatar saves behind a plain-language loading state while resolution is pending (FR-007a, SC-012)
- [ ] T017 [US1] Fix the wrong-account write at `src/App.tsx:5519` — build the image-fingerprint path from `effectiveUid`, not `user.uid`, so a team member's write targets the owner's workspace subtree

**Checkpoint**: US1 fully functional. Run quickstart rows 1–7. Row 2 (workspaces contain the owner's
projects) is the one that proves the server half landed.

---

## Phase 4: User Story 2 - Team members cannot change which workspaces exist (Priority: P1)

**Goal**: No team member of any role can add, remove, or alter a workspace — not through a control, and
not by calling the server directly. Refusals name a permission problem, never a missing workspace.

**Independent Test**: As Member-E and Member-V, confirm no create, edit, or delete control appears. Call
`deleteWorkspace`, `createWorkspace`, and `updateWorkspace` directly and confirm each returns
`permission-denied` with the workspace intact and nothing created under the member's own account.

### Server — refusal guards (contracts/workspace-mutations.md)

- [ ] T018 [US2] Add `assertNotTeamMember(callerUid, action)` to `functions/src/workspaces/workspacePolicy.ts` — read the caller's user doc, throw `HttpsError('permission-denied', …, { reason: 'team_member' })` when `isTeamMember === true`, and emit `issue-d ▸ workspace action refused — action=<…> caller=<…> owner=<…> workspace=<…> reason=team_member`
- [ ] T019 [US2] Call `assertNotTeamMember` as the **first** statement — before payload validation, workspace lookup, or any write — in `createWorkspace` (`functions/src/index.ts:6314`), `updateWorkspace` (`:6370`), `deleteWorkspace` (`:6431`), and `restoreWorkspace` (`:6474`)
- [ ] T020 [P] [US2] Add mutation decision-table cases M1–M7 from `specs/965-team-workspace-access/contracts/workspace-mutations.md` to `functions/src/__tests__/teamWorkspaceAccess.test.ts`, including M1/M6 owner-unchanged rows that guard SC-007

### Frontend — withheld controls

- [ ] T021 [US2] Withhold the edit control in `src/components/WorkspaceSwitcher.tsx:151-156` when `isTeamMember` is true, leaving it untouched for owners (the create button at `:161` is already correctly gated — verify, do not duplicate)
- [ ] T022 [US2] Add an `isTeamMember` prop to `src/components/WorkspaceSettingsModal.tsx` and withhold the delete control at `:359-381` when it is true; pass the prop from the modal's call site in `src/App.tsx`
- [ ] T023 [US2] Remove the workspace access matrix from `src/pages/Team.tsx` — the table at `~:450-500`, the `handleWorkspaceAccessToggle` handler at `:244-250`, the `wsAccessLoading` state, and the `fnSetTeamMemberWorkspaceAccess` binding at `:15`; leave the `setTeamMemberWorkspaceAccess` callable deployed and every stored `workspaceAccess` array untouched (FR-021)
- [ ] T024 [P] [US2] Add the plain-language refusal message keys in `src/i18n.tsx` for both `en` and `ar`, stating that only the account owner may add, change, or remove workspaces

**Checkpoint**: US1 + US2 both work. Run quickstart rows 8–14 and the owner regression rows 21–23.

---

## Phase 5: User Story 3 - The account's workspace list stays live for team members (Priority: P2)

**Goal**: Owner-side workspace changes reach signed-in members without a reload, and a removed member's
view of the account closes at once rather than lingering.

**Independent Test**: Two browsers — member and owner. Create, rename, and delete workspaces as the owner
and confirm each change reaches the member within 10 seconds. Then remove the member and confirm their
workspaces clear, no further updates arrive, and the removal overlay appears in the correct language.

- [ ] T025 [US3] Replace `getDocs` with `onSnapshot` in the workspace effect in `src/App.tsx:2370-2404`, returning the unsubscribe from the effect so it is torn down whenever `effectiveUid` or `teamResolution` changes
- [ ] T026 [US3] Close the workspace listener and clear `workspaces` when membership ends in `src/App.tsx` — hook onto the existing removal signal at `:1945-1947` (`wasTeamMemberRef` / `setRemovedFromTeam`) so no permission error surfaces after removal (FR-016, quickstart row 20)
- [ ] T027 [US3] Handle deletion of the workspace the member is currently using in `src/App.tsx` — reuse the existing switch-guard dialog (`WorkspaceSwitcher.tsx:174-202`, driven by `hasInProgressWork`) rather than building a second mechanism: when the active workspace disappears from the live snapshot and `hasInProgressWork` is true, open the guard with the account's default workspace as the target so the member chooses save or discard; when it is false, move to the default silently. In both cases show a plain-language notice that the workspace is no longer available (AS-3.3, FR-017)
- [ ] T028 [US3] Replace the hardcoded English in the removed-from-team overlay at `src/App.tsx:11269-11271` with `t()` calls — both the body text and the "Continue" button currently bypass i18n entirely, so Arabic users see English (Constitution V, FR-016a)
- [ ] T029 [P] [US3] Add the overlay and workspace-removed message keys in `src/i18n.tsx` for both `en` and `ar`

**Checkpoint**: All three stories independently functional. Run quickstart rows 15–20.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 Run the full gate green using the `Run-Step` fail-fast wrapper in `specs/965-team-workspace-access/quickstart.md` — functions build, functions test, frontend build, frontend lint. Bare `;` chaining is not acceptable here: "full gate green" cannot be claimed from a chain where a failing step is masked by the next one
- [ ] T031 [P] Verify locale parity for SC-008 — every key added or changed in `src/i18n.tsx` exists in both the `en` block and the `ar` block, and no new user-facing string contains technical vocabulary
- [ ] T032 [P] Run the project's user-facing wording guard against the changed files to confirm 0 forbidden technical terms (SC-008)
- [ ] T033 Execute the full 30-row verification matrix in `specs/965-team-workspace-access/quickstart.md` and record before/after evidence for each defect (Constitution IX)
- [ ] T034 [P] Update the ISSUE-D row in `docs/LAUNCH_MATRIX.md:2501` to resolved, citing this branch, and note that role-based workspace editing was split to a follow-up spec
- [ ] T035 Deploy the functions to `europe-west1` following **`AGENTS.md` rule #1 (FIREBASE LIB SYNC)** verbatim — `Remove-Item -Recurse -Force functions/lib`, then `cd functions; npm run build`, then `firebase deploy --only functions`. Do **not** substitute a selective `--only functions:a,b,c` list and do **not** skip the `lib` wipe: `lib/` is compiled output that does not auto-update, and a stale or partially-rebuilt `lib` deploys code that does not match this branch
- [ ] T036 Production-test rows 1–3, 3a, 9–10, 19, and 28–29 of the quickstart matrix against the deployed build. Rows 28–29 confirm the refusal and override log lines appear in Cloud Logging with the expected shape — the format is unverifiable before deploy, and SC-011 depends on it being queryable in production

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks all three user stories**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational; independent of US1
- **US3 (Phase 5)**: depends on Foundational; the listener replaced in T025 is the fetch established in T011, so US3 is smoother after US1 but does not require it
- **Polish (Phase 6)**: depends on all shipped stories

### Critical ordering constraint (Constitution XI)

**T006–T008 must deploy before US1's frontend is verifiable in production.** T009 (test contract inversion) and T010 (decision-table cases) are local-only test changes and need not deploy. The server narrows a member's reach to a stored per-member list that is empty for every new member, so a correct frontend against the old server still shows empty workspaces. Do not interpret an empty picker during frontend work as a frontend defect until the server half is deployed.

### Within each story

- Server access truth before frontend consumption (US1: T006–T008 → T011–T017)
- Guard helper before its call sites (US2: T018 → T019)
- Fetch before listener conversion (T011 → T025)
- `teamResolution` before anything that reads it (T003 → T004 → T005 → everything else)

### Parallel opportunities

- T002 runs alongside T001
- T010 (new test file) runs alongside T006–T009 (source files)
- T015, T024, T029 all touch `src/i18n.tsx` — each is parallel to the `App.tsx` work in its own phase, but **not to each other**; sequence them or merge into a single i18n pass
- T020 runs alongside T018–T019
- US2's server half (T018–T020) is fully parallel with US1's frontend half (T011–T017) — different files, no shared state
- T031, T032, T034 are mutually parallel in Polish

### Same-file conflicts to respect

`src/App.tsx` is touched by T003, T004, T005, T011, T012, T013, T014, T016, T017, T022, T025, T026,
T027, T028. None of these may be marked [P] with one another.

---

## Parallel Example: after Foundational completes

```bash
# Two developers, no file contention:
Developer A: T006, T007, T008, T009, T010   # functions/src/workspaces/, functions/src/__tests__/
Developer B: T021, T023                      # src/components/WorkspaceSwitcher.tsx, src/pages/Team.tsx

# Then converge on src/App.tsx sequentially for T011-T017.
```

---

## Implementation Strategy

### MVP scope

**US1 + US2 together.** Unusually, the MVP is two stories rather than one: US1 grants a team member
sight of every workspace, and US2 withholds the destructive controls. Shipping US1 alone would give a
member visibility of the owner's workspaces while `createWorkspace` still succeeds into the member's own
account (T012 and T019 both close that). They are both P1 for this reason.

### Incremental delivery

1. Setup + Foundational → membership resolution is deterministic
2. US1 + US2 → **ISSUE-D cleared**, Phase 14 unblocked, deploy
3. US3 → live updates and immediate revocation, deploy
4. Follow-up spec → role-based editing (deferred in clarification)

### Gate order (project convention — no step skipped)

```
implement → build → test → commit → push → PR → CodeRabbit → Claude audit
→ npm run dev test → merge via GitHub UI → deploy → production test
```

---

## Notes

- `[P]` = different files, no dependencies on incomplete work
- No Firestore rules change and no schema migration in any task — `firestore.rules:41-48` already permits the member read
- T009 edits a passing test on purpose; the commit message must say so, or review will read it as a regression
- Owner behaviour must be observably unchanged throughout (SC-007) — quickstart rows 21–23 are not optional
