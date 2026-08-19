---
description: "Task list for Workspace-Aware Meta Integration"
---

# Tasks: Workspace-Aware Meta Integration

**Input**: Design documents from `/specs/967-meta-workspace-isolation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/callable-contracts.md, quickstart.md

**Tests**: INCLUDED. The spec defines a contract test matrix (T-01–T-24 in `contracts/callable-contracts.md`), and constitution Principles IV and IX require explicit behaviour contracts and before/after proof for every claimed fix.

**Organization**: Grouped by user story. Note the deliberate sequencing decision below before starting.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US5, mapping to the user stories in spec.md

## Path Conventions

Web application. Backend `functions/src/`, frontend `src/`, both at repository root. All Cloud Functions deploy to `europe-west1`.

---

## ⚠️ Sequencing note — read before starting

User Story 5 (workspace listing, P5 by value) is delivered by **Phase 2 Foundational**, not by its own phase. Its root cause — legacy workspace records missing `deletedAt` (research.md R1) — also hides the workspaces every other story depends on, and the same repair supplies the default-workspace marker that User Story 1's publish fallback needs (R4). The repair therefore blocks everything and runs first; Phase 7 is US5's verification and evidence capture.

Two constraints that are easy to get wrong, repeated here because they fail silently:

- The repair MUST scan unconstrained. Reading with `where('deletedAt','==',null)` returns exactly the records that do **not** need repairing.
- The `isDefault` decision MUST sit inside `createWorkspaceWithLimit`'s existing transaction, or two concurrent creations on a fresh account both claim the default.

---

## Phase 1: Setup

**Purpose**: Shared type and string scaffolding. No project initialisation — this is an existing codebase.

- [ ] T001 [P] Add `metaPageId`, `metaPageName`, `metaPageClearedAt` to the `Workspace` interface in `src/types.ts` (all `string | null` / `number | null`, optional for legacy records)
- [ ] T002 [P] Add the same three fields to the backend workspace shape used by `createWorkspaceWithLimit` in `functions/src/workspaces/workspacePolicy.ts`
- [ ] T003 [P] Add `workspaceIdSource`, `pageSource`, `pushedByUid` to the deployment record shape written at `functions/src/index.ts:3763` (`creativeDeployments`)
- [ ] T004 [P] Add paired en/ar keys to `src/i18n.tsx` for the five new messages — Page cleared, no workspace resolved, workspace has no ad account, account-wide disconnect warning, needs-Meta-link label. Arabic in simple Fusha, no dialect, no technical terms (FR-028b)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data repair, source fix, and the shared caller-scope guard that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase completes and **T010 and T021 pass** — the repair has executed with zero remaining unmarked records, and the listing path returns them.

### Data repair (research.md R1 + R4, FR-026c–FR-026g)

- [ ] T005 Write the one-off repair script at `scripts/repair-workspace-markers.ts` following the Admin SDK recipe: unconstrained `collectionGroup('workspaces')` scan, `GOOGLE_CLOUD_QUOTA_PROJECT` + `NODE_PATH` set locally
- [ ] T006 Implement repair pass 1 in `scripts/repair-workspace-markers.ts` — for every workspace record with no `deletedAt` key, write `deletedAt: null`. Must not touch records that already have the key, whether its value is null or a timestamp (FR-026c, FR-024, FR-026e)
- [ ] T007 Implement repair pass 2 in `scripts/repair-workspace-markers.ts` — for every account with no workspace holding `isDefault: true`, mark the oldest active workspace by `createdAt` ascending. Must run only after pass 1 has completed for that account, and must consider only workspaces whose `deletedAt` is null (FR-026d)
- [ ] T008 Add a `--dry-run` mode to `scripts/repair-workspace-markers.ts` reporting per-account counts of records missing each marker, changing nothing
- [ ] T009 Capture before-evidence: run `--dry-run` against the nine-workspace account and record the output in `specs/967-meta-workspace-isolation/evidence-r1.md` (constitution Principle IX)
- [ ] T010 Execute the repair, then re-run `--dry-run` and confirm zero remaining records missing either marker; append the after-evidence to `specs/967-meta-workspace-isolation/evidence-r1.md` (SC-014)

### Default-marker source fix (FR-026d)

- [ ] T011 Move the `isDefault` decision into the `createWorkspaceWithLimit` transaction in `functions/src/workspaces/workspacePolicy.ts` — mark the workspace as default when the transaction observes no other active workspace on the account
- [ ] T012 Replace the hard-coded `isDefault: false` at `functions/src/index.ts:6519` with the transaction-computed value from T011

### Page field-write lock (research.md R7, protects FR-007 / FR-011)

- [ ] T013 Add `metaPageId` and `metaPageName` to the forbidden-fields list at `functions/src/index.ts:6546` so they cannot be written through `updateWorkspace`, bypassing the Page validation and the FR-011 clearing rule

### Shared caller-scope guard (FR-001–FR-004, research.md R3)

- [ ] T014 Create `functions/src/workspaces/metaCallerScope.ts` exporting `resolveMetaScope(request)` — wraps `resolveCallerScope`, throws `unauthenticated` with no auth, and throws `unavailable` when `readDegraded` is set (FR-003)
- [ ] T015 Add `assertWorkspaceAllowed(scope, workspaceId)` to `functions/src/workspaces/metaCallerScope.ts`, throwing `permission-denied` with `reason: 'workspace_not_permitted'` when the workspace is outside `allowedWorkspaceIds` (FR-004, FR-021)
- [ ] T016 Add `loadActiveWorkspace(ownerUid, workspaceId)` to `functions/src/workspaces/metaCallerScope.ts` — loads the record, throws `not-found` if absent, and reuses `assertWorkspaceActive` for the soft-delete check (FR-024)

### Foundational tests

- [ ] T017 [P] Contract test T-02 in `functions/src/__tests__/metaCallerScope.test.ts` — `readDegraded` produces `unavailable` and performs no write
- [ ] T018 [P] Contract test T-03 in `functions/src/__tests__/metaCallerScope.test.ts` — workspace outside the permitted set produces `permission-denied`
- [ ] T019 [P] Contract tests T-19 and T-22 in `functions/src/__tests__/workspace.test.ts` — first workspace on an account is marked default, second is not; repair picks the oldest active workspace
- [ ] T020 [P] Contract tests T-20 and T-21 in `functions/src/__tests__/workspaceRepair.test.ts` — repair is idempotent on a second run and writes no Page field (FR-026e, FR-026f)
- [ ] T021 [P] Contract test T-17 in `functions/src/__tests__/workspace.test.ts` — a workspace record lacking `deletedAt` is returned by the listing path after repair
- [ ] T022 [P] Contract test T-23 in `functions/src/__tests__/workspaceRepair.test.ts` — a record whose `deletedAt` holds a non-null timestamp is left **completely untouched** by both repair passes, and is neither re-marked active nor eligible to become the account default (FR-024, FR-026d)

**Checkpoint**: All nine workspaces list for owner and team member; soft-deleted workspaces stay hidden; `resolveDefaultWorkspaceId` resolves on a post-2026-05-21 account. User story work can begin.

---

## Phase 3: User Story 1 - Publishing lands in the correct client's ad account and Page (Priority: P1) 🎯 MVP

**Goal**: A creative published from a workspace goes to that workspace's ad account, never to whichever ad account was last selected account-wide.

**Independent Test**: Link two workspaces to two different ad accounts, set `metaConnections.selectedAccountId` to the first by hand, publish from the second, and confirm the image lands in the second workspace's ad account.

### Tests for User Story 1

- [ ] T023 [P] [US1] Contract test T-04 in `functions/src/__tests__/metaPush.test.ts` — publish from workspace A ignores `selectedAccountId` pointing at workspace B's account
- [ ] T024 [P] [US1] Contract test T-05 in `functions/src/__tests__/metaPush.test.ts` — publish with no `workspaceId` resolves the account default
- [ ] T025 [P] [US1] Contract test T-06 in `functions/src/__tests__/metaPush.test.ts` — no resolvable workspace produces `no_workspace_resolved`
- [ ] T026 [P] [US1] Contract test T-07 in `functions/src/__tests__/metaPush.test.ts` — workspace with no ad account is refused, message names the workspace, nothing created
- [ ] T027 [P] [US1] Contract test T-08 in `functions/src/__tests__/metaPush.test.ts` — workspace with no Page **succeeds** and records `pageSource: 'none'`
- [ ] T028 [P] [US1] Contract test T-16 in `functions/src/__tests__/metaPushPack.test.ts` — every item in a pack shares one workspace's ad account and Page
- [ ] T029 [P] [US1] Contract test T-24 in `functions/src/__tests__/metaPush.test.ts` — across a sample covering all three `pageSource` values and both `workspaceIdSource` values, every deployment record has `workspaceId`, `workspaceIdSource`, `adAccountId`, `pageSource`, and `pushedByUid` populated, with no field left undefined (FR-027, SC-008)

### Implementation for User Story 1

- [ ] T030 [US1] Add `resolvePublishWorkspace(scope, requestedWorkspaceId)` to `functions/src/workspaces/metaCallerScope.ts` — returns `{ workspaceId, workspaceIdSource }`, falling back to `resolveDefaultWorkspaceId` and throwing `failed-precondition` with `reason: 'no_workspace_resolved'` when none resolves (FR-012, FR-012a)
- [ ] T031 [US1] Add `resolveWorkspacePage(workspace, connection)` to `functions/src/workspaces/metaCallerScope.ts` — returns `{ pageId, pageName, pageSource }`, consulting the legacy global Page only when `metaPageClearedAt` is null (FR-007, FR-011a, FR-028)
- [ ] T032 [US1] Replace `request.auth.uid` with the resolved owner uid in `metaPushCreative` at `functions/src/index.ts:3686` using `resolveMetaScope` (contract C4)
- [ ] T033 [US1] Replace `const accountId = conn.selectedAccountId` at `functions/src/index.ts:3709` with the workspace's `metaAdAccountId`, refusing with `workspace_no_ad_account` and the workspace name when absent (FR-009, FR-013, FR-014, FR-015)
- [ ] T034 [US1] Replace the global Page read at `functions/src/index.ts:3790-3791` with `resolveWorkspacePage` output, and add a code comment recording that publishing is deliberately **not** gated on the Page while no Meta request consumes it, to be reconsidered when ad creation is built (FR-006, FR-015a, FR-015b — constitution Principle XII)
- [ ] T035 [US1] Record `workspaceId`, `workspaceIdSource`, `pageSource`, `pushedByUid` on the deployment record at `functions/src/index.ts:3763` (FR-027)
- [ ] T036 [US1] Apply the same scope, workspace, and ad-account resolution to `metaPushCreativePack` at `functions/src/index.ts:5705` (contract C5)
- [ ] T037 [US1] Delete the `accountId = conn.selectedAccountId` fallback at `functions/src/index.ts:5732-5734` (FR-009, FR-014)
- [ ] T038 [US1] Resolve the workspace once per pack in `metaPushCreativePack` and reuse it for every item; accept `activeWorkspaceId` as an alias of `workspaceId` (FR-016)
- [ ] T039 [P] [US1] Send `workspaceId` from `metaService.pushCreative` in `src/services/metaService.ts:234`
- [ ] T040 [P] [US1] Rename `activeWorkspaceId` to `workspaceId` in `metaService.pushCreativePack` in `src/services/metaService.ts:287`
- [ ] T041 [US1] Pass the active workspace id from the publish call sites in `src/App.tsx` to both service methods
- [ ] T042 [US1] Surface the no-ad-account and no-workspace refusals using the T004 i18n keys at the publish call sites in `src/App.tsx`

### Regression verification for User Story 1

- [ ] T043 [US1] End-to-end publish from a **Starter** account and a **Pro** account — both plans have `workspaceLimit: 1` and never populate an active workspace client-side. Publish once on each **before** the phase changes and once **after**, and record all four outcomes in `specs/967-meta-workspace-isolation/evidence-r1.md`. Both after-runs must succeed with no extra user step, resolving through the account default (FR-012b, SC-010)

**Checkpoint**: Publishing is workspace-routed end to end, and single-workspace plans are provably unaffected. SC-001, SC-007, SC-008, SC-010 verifiable.

---

## Phase 4: User Story 2 - Each workspace keeps its own Facebook Page (Priority: P2)

**Goal**: Page selection is recorded per workspace, switches with the workspace, and never leaks across clients.

**Independent Test**: Choose a different Page in each of two workspaces, switch back and forth, and confirm each shows its own without the other changing.

### Tests for User Story 2

- [ ] T044 [P] [US2] Contract test T-11 in `functions/src/__tests__/metaSelectPage.test.ts` — a CLEARED workspace does not inherit the legacy global Page
- [ ] T045 [P] [US2] Contract test T-12 in `functions/src/__tests__/metaSelectPage.test.ts` — a NEVER_SET workspace does inherit it
- [ ] T046 [P] [US2] Test in `functions/src/__tests__/metaSelectPage.test.ts` — selecting a Page absent from the connection's `pages[]` produces `page_not_available`

### Implementation for User Story 2

- [ ] T047 [US2] Convert `metaSelectPage` at `functions/src/index.ts:3404` to `resolveMetaScope`, accept an optional `workspaceId`, and default to `resolveDefaultWorkspaceId` (contract C1, FR-018)
- [ ] T048 [US2] Validate the selected `pageId` against `metaConnections/{ownerUid}.pages[]` in `metaSelectPage`, throwing `failed-precondition` with `reason: 'page_not_available'`
- [ ] T049 [US2] Write `metaPageId`, `metaPageName` (truncated to 200 chars) and `metaPageClearedAt: null` to the workspace record in `metaSelectPage` (FR-005, FR-008)
- [ ] T050 [US2] Keep writing `selectedPageId`/`selectedPageName` to `metaConnections/{ownerUid}` in `metaSelectPage` so a code-only revert restores current behaviour (FR-030)
- [ ] T051 [US2] Extend `getMetaConnection` at `functions/src/index.ts:3340` to accept an optional `workspaceId` and return `activePageId`, `activePageName`, `pageSource` (contract C6, FR-006)
- [ ] T052 [P] [US2] Pass `workspaceId` from the Page picker call site in `src/App.tsx:3785` through `metaService.selectPage`
- [ ] T053 [P] [US2] Add the `workspaceId` parameter to `selectPage` in `src/services/metaService.ts`
- [ ] T054 [US2] Read the active Page from the workspace rather than `metaConnection.selectedPageId` at `src/App.tsx:12834` and `src/App.tsx:4072`
- [ ] T055 [US2] Stop writing global Page state on workspace switch in `src/App.tsx:3789-3790`; the backend now resolves it per workspace (FR-006)

### Regression verification for User Story 2

- [ ] T056 [US2] On an account that holds a legacy account-level Page and has **never** chosen a per-workspace Page (a NEVER_SET workspace), confirm publishing still targets that legacy Page and the interface still displays it, with `pageSource: 'legacy_global'` recorded. Then choose a per-workspace Page and confirm the legacy value is no longer consulted for that workspace. Record both in `specs/967-meta-workspace-isolation/evidence-r1.md` (FR-007, FR-010, SC-006)

**Checkpoint**: Two workspaces hold two different Pages simultaneously, and accounts on the legacy Page are provably unaffected until they opt in. SC-003, SC-006 verifiable.

---

## Phase 5: User Story 3 - A team member can use the Meta integration at all (Priority: P3)

**Goal**: Every Meta operation a team member performs reads and writes the owner's records, including establishing the connection.

**Independent Test**: Sign in as a team member on an account with a connected Meta integration and confirm every Meta screen shows what the owner sees, with no record created under the member's own identity.

### Tests for User Story 3

- [ ] T057 [P] [US3] Contract test T-01 in `functions/src/__tests__/metaScope.integration.test.ts` — a team member call reads and writes owner paths only (FR-001)
- [ ] T058 [P] [US3] Contract test T-15 in `functions/src/__tests__/metaOAuthCallback.test.ts` — a callback carrying a member identity writes to the owner's connection record
- [ ] T059 [P] [US3] Test in `functions/src/__tests__/metaScope.integration.test.ts` — no `metaConnections/{memberUid}` record exists after a full team-member pass (FR-002, SC-009)

### Implementation for User Story 3

- [ ] T060 [US3] Convert `getMetaConnection` at `functions/src/index.ts:3340` to `resolveMetaScope`. **Not parallel** — same function as T051; run after it, or fold the two edits together
- [ ] T061 [P] [US3] Convert `metaSelectAccount` at `functions/src/index.ts:3366` to `resolveMetaScope`
- [ ] T062 [P] [US3] Convert `metaDisconnect` at `functions/src/index.ts:3437` to `resolveMetaScope` and record `disconnectedByUid` (contract C8, FR-020a)
- [ ] T063 [P] [US3] Convert `metaSyncPerformance` at `functions/src/index.ts:3458` to `resolveMetaScope`, changing nothing else (contract C9, FR-009a)
- [ ] T064 [P] [US3] Convert `saveFunnelSettings` at `functions/src/funnelSettings.ts:260` to `resolveMetaScope` with `assertWorkspaceAllowed`
- [ ] T065 [P] [US3] Convert `getFunnelSettings` at `functions/src/funnelSettings.ts:390` to `resolveMetaScope` with `assertWorkspaceAllowed`
- [ ] T066 [P] [US3] Convert `dismissAdvisory` at `functions/src/funnelSettings.ts:440` to `resolveMetaScope` with `assertWorkspaceAllowed`
- [ ] T067 [P] [US3] Convert `connectMetaAccount` at `functions/src/metaConnection.ts:108` to `resolveMetaScope` and remove any team-member block (contract C11, FR-020)
- [ ] T068 [P] [US3] Convert `disconnectMetaAccount` at `functions/src/metaConnection.ts:235` to `resolveMetaScope` and record who acted
- [ ] T069 [P] [US3] Convert `triggerMetaSync` at `functions/src/metaSync/trigger.ts:25` to `resolveMetaScope`
- [ ] T070 [US3] Resolve the identity to the owner in `metaOAuthCallback` at `functions/src/index.ts:3196` after reading `state`, and write the connection to `metaConnections/{ownerUid}` with `userId: ownerUid` and `connectedByUid: state` (contract C7, FR-020a-i)
- [ ] T071 [US3] Leave the `state` parameter's production, transmission, and validation untouched in `metaOAuthCallback`; add a comment recording that the state-trust work is a separate phase (FR-020a-ii)
- [ ] T072 [US3] Render a retry page and write nothing when `readDegraded` is set in `metaOAuthCallback` (FR-003)
- [ ] T073 [US3] Audit `metaDataDeletion` at `functions/src/index.ts:6091`, `metaDailySync` at `functions/src/metaSync/dispatcher.ts:68`, and `metaSyncAccountWorker` at `functions/src/metaSync/worker.ts:31`, confirming each targets owner accounts only; record findings in `specs/967-meta-workspace-isolation/evidence-r1.md` (research.md R2 group 2)
- [ ] T074 [US3] Add the account-wide scope confirmation before the disconnect call in `src/App.tsx` using the T004 i18n key (FR-020a)
- [ ] T075 [US3] Present the reconnect-required state to every member when an authorisation stops working, in `src/App.tsx` (FR-020b)

**Checkpoint**: A team member can operate every Meta surface. SC-002, SC-009, SC-011 verifiable.

---

## Phase 6: User Story 4 - A team member links the right ad account and Page to a client workspace (Priority: P4)

**Goal**: Team members link ad accounts and Pages to the owner's workspaces; the Page clears whenever the ad account changes.

**Independent Test**: As a team member, link an ad account and Page to a workspace, then confirm as the owner that the workspace shows both.

### Tests for User Story 4

- [ ] T076 [P] [US4] Contract test T-09 in `functions/src/__tests__/linkMetaAccount.test.ts` — linking an ad account clears the Page in the same write
- [ ] T077 [P] [US4] Contract test T-10 in `functions/src/__tests__/linkMetaAccount.test.ts` — unlinking clears the Page
- [ ] T078 [P] [US4] Contract test T-13 in `functions/src/__tests__/linkMetaAccount.test.ts` — a team member links an ad account successfully
- [ ] T079 [P] [US4] Contract test T-14 in `functions/src/__tests__/workspace.test.ts` — a team member is still refused create, delete, and restore (FR-019)

### Implementation for User Story 4

- [ ] T080 [US4] Remove `assertNotTeamMember(uid, "link_meta")` from `linkMetaAccountToWorkspace` at `functions/src/index.ts:6711` and convert to `resolveMetaScope` with `assertWorkspaceAllowed` (contract C2, FR-017)
- [ ] T081 [US4] Clear `metaPageId`, `metaPageName` and set `metaPageClearedAt` in the **same** write as the ad-account link at `functions/src/index.ts:6746` (FR-011, FR-011a)
- [ ] T082 [US4] Return `pageCleared` from `linkMetaAccountToWorkspace` to drive the user notice (FR-011b)
- [ ] T083 [US4] Convert `unlinkMetaAccountFromWorkspace` at `functions/src/index.ts:6756` to `resolveMetaScope` and clear the Page on removal too (contract C3, FR-011)
- [ ] T084 [P] [US4] Surface the Page-cleared notice from `pageCleared` in `src/components/LinkAdPickerModal.tsx` using the T004 i18n key (FR-011b)
- [ ] T085 [US4] Allow team members to reach the ad-account and Page pickers in `src/App.tsx` and `src/components/MenuItems.tsx`, reversing the PR #65 hiding for these two actions only (FR-017, FR-018)

**Checkpoint**: Team members manage workspace Meta links. FR-017–FR-019 verifiable.

---

## Phase 7: User Story 5 - Funnel Settings lists every workspace (Priority: P5)

**Goal**: All nine workspaces appear for owner and team member, and no deleted workspace does. The fix ships in Phase 2; this phase proves it and records the evidence FR-025 requires.

**Independent Test**: Count entries in the Funnel Settings selector as owner and as team member; both must equal the active workspace count in stored data.

- [ ] T086 [US5] Write the root-cause statement to `specs/967-meta-workspace-isolation/evidence-r1.md` — which records were dropped, the condition that dropped them, the causal commit, and why the repair removes the cause rather than masking it (FR-025, SC-005)
- [ ] T087 [US5] Confirm the Funnel Settings selector at `src/App.tsx:12664` needs no code change once the records are repaired, and record that conclusion in the evidence file (FR-022)
- [ ] T088 [US5] Enumerate every other surface reading the workspace subscription at `src/App.tsx:2668` and confirm each now lists correctly; record the list in the evidence file (FR-026, FR-026a, FR-026b)
- [ ] T089 [US5] Verify the "needs Meta link" label still shows for unlinked workspaces in `src/components/FunnelSettingsForm.tsx` (FR-023)
- [ ] T090 [US5] Capture owner and team-member selector counts against the nine-workspace account in the evidence file (SC-004)
- [ ] T091 [US5] Soft-delete a workspace on the nine-workspace account and confirm it appears in **no** selector — Funnel Settings, the workspace switcher, the ad-account linker, and every surface enumerated in T088 — for both owner and team member. Confirm the repair did not resurrect it by re-marking `deletedAt`. Record before and after counts in the evidence file (FR-024)

**Checkpoint**: SC-004 and SC-005 satisfied; deleted workspaces provably stay hidden; constitution Principle IX evidence complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T092 [P] Contract test T-18 in `src/__tests__/i18n.test.ts` — every new key exists in both languages (FR-028a, FR-028c, SC-012)
- [ ] T093 [P] Review every new Arabic string for simple Fusha, no dialect, no technical terms (FR-028b)
- [ ] T094 Grep the touched backend files and confirm `request.auth.uid` no longer appears in any Firestore path; record the remaining legitimate uses (audit only) in the evidence file (FR-001, FR-002)
- [ ] T095 Confirm `conn.selectedAccountId` is read by neither publish path (FR-009, FR-014)
- [ ] T096 Verify the rollback guarantee — on an account holding per-workspace Pages, revert the code and confirm publishing behaves exactly as before with no cleanup step (FR-029, FR-030, FR-031, FR-026g, SC-013)
- [ ] T097 Run `npm run build`, `npm run lint`, and `cd functions && npm test`; all must pass
- [ ] T098 Add the phase entry to `CLAUDE.md` under Recent Changes, matching the existing convention
- [ ] T099 Complete the manual verification pass in `quickstart.md` and record results against SC-001 through SC-014

---

## Dependencies

### Phase order

```
Phase 1 Setup
      ↓
Phase 2 Foundational  ← BLOCKS EVERYTHING (repair + source fix + scope guard)
      ↓
      ├─→ Phase 3 US1 (P1)  publish routing        🎯 MVP
      ├─→ Phase 4 US2 (P2)  per-workspace Page
      ├─→ Phase 5 US3 (P3)  team-member access
      ├─→ Phase 6 US4 (P4)  team-member linking
      └─→ Phase 7 US5 (P5)  listing verification
              ↓
      Phase 8 Polish
```

### Story dependencies

- **US1** depends only on Phase 2 (needs the default-workspace marker from T007/T011 and the scope guard from T014–T016). It reads `metaPageId`, which is declared in T001/T002 and simply resolves to `null` until US2 populates it — so US1 ships and is testable on its own.
- **US2** depends only on Phase 2.
- **US3** depends only on Phase 2, except T060 (see below).
- **US4** depends on Phase 2, and on T031 for the `metaPageClearedAt` semantics its clearing writes rely on.
- **US5** depends on Phase 2 only — it is verification of work already shipped there.

### Within-phase notes

- T005 → T006 → T007 are strictly sequential (one script, ordered passes).
- T009 must run **before** T010, and both before any listing change — that ordering is the Principle IX evidence.
- T011 → T012 sequential (same decision, two files).
- T030 and T031 must precede T032–T038.
- T043 requires a before-run **prior to** T032–T042 landing; capture that baseline first.
- **T051 → T060**: both modify `getMetaConnection`. T060 is deliberately not marked `[P]`. Run it after T051, or merge the two edits into a single change.
- T081 must be a single write with T080's link, never a follow-up write.
- T091 requires T010 complete, so the repair's treatment of already-deleted records can be observed.

---

## Parallel execution examples

**Phase 1** — all four tasks touch different files:

```
T001 (src/types.ts)  ‖  T002 (workspacePolicy.ts)  ‖  T003 (index.ts)  ‖  T004 (i18n.tsx)
```

**Phase 2 tests** — after T016:

```
T017 ‖ T018 ‖ T019 ‖ T020 ‖ T021 ‖ T022
```

**Phase 5** — nine of the ten conversions are independent once T014–T016 exist (T060 excluded, see Dependencies):

```
T061 ‖ T062 ‖ T063 ‖ T064 ‖ T065 ‖ T066 ‖ T067 ‖ T068 ‖ T069
```

Highest-value parallelism: run **US2, US3, and US4 concurrently** after Phase 2. They touch largely disjoint callables, and only the `getMetaConnection` overlap (T051/T060) needs coordination — already handled by dropping the parallel marker.

---

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).**

That combination fixes the defect with external consequences — a creative landing in another client's ad account media library — and repairs the data that hides six of nine workspaces. It is shippable on its own: single-workspace accounts keep working through the default-workspace resolution (proved by T043), and per-workspace Pages simply resolve to the legacy global until US2 lands.

**Incremental delivery after the MVP:**

1. **US3** next despite its P3 ranking — it is currently a total block on team members, and it is the most parallel phase in the plan.
2. **US2** — completes the Page half of routing.
3. **US4** — depends on US3 being in place.
4. **US5** — verification and evidence; can be done any time after Phase 2.

Each phase lands behind its own contract tests, so stopping after any checkpoint leaves a coherent, shippable state.

---

## Task summary

| Phase | Tasks | Count |
|---|---|---|
| 1 — Setup | T001–T004 | 4 |
| 2 — Foundational | T005–T022 | 18 |
| 3 — US1 (P1) 🎯 | T023–T043 | 21 |
| 4 — US2 (P2) | T044–T056 | 13 |
| 5 — US3 (P3) | T057–T075 | 19 |
| 6 — US4 (P4) | T076–T085 | 10 |
| 7 — US5 (P5) | T086–T091 | 6 |
| 8 — Polish | T092–T099 | 8 |
| **Total** | | **99** |

Test tasks: 24, mapping one-to-one to the T-01–T-24 contract matrix.
