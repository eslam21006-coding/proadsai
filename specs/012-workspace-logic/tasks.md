# Tasks: Workspace Logic (Scale Mode)

**Input**: Design documents from `/specs/012-workspace-logic/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: Included — the feature spec (FR-025, section 12.12 of `docs/LAUNCH_MATRIX.md`, and the constitution's Principle IX "proof required for every claimed fix") explicitly requires contract fixture tests for the high-risk paths. Tests are written BEFORE the implementation they cover.

**Organization**: Tasks are grouped by the 5 user stories in `spec.md`, in priority order. Each story is independently testable and delivers value on its own. Setup and Foundational phases unblock every story; the final phase is cross-cutting polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file than sibling tasks in the same phase, no unfinished dependency — safe to run in parallel
- **[Story]**: Maps the task to User Story 1–5 from spec.md; omitted in Setup / Foundational / Polish phases
- File paths are absolute within the repo root

## Path Conventions

Web application (Option 2 in plan.md):

- Frontend: `src/**`
- Backend: `functions/src/**`
- Firestore config: `firestore.rules`, `firestore.indexes.json`
- Spec artifacts: `specs/012-workspace-logic/**`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add type definitions, i18n strings, Firestore config, and the empty `workspaces/` module scaffold so every later phase has a place to write code.

- [x] T001 [P] Add new Workspace fields (`metaAdAccountId`, `metaAdAccountName`, `metaRoleAtLinkTime`, `deletedAt`, `pendingReassign`, `pendingRestore`) and a new `WorkspaceAccessAuditEntry` interface to `src/types.ts` per `specs/012-workspace-logic/data-model.md` sections 1 and 5
- [x] T002 [P] Add `reassignedFromWorkspaceId` field to the `GenerationRecord` and `SavedProject` types in `src/types.ts` (SavedProject already has `workspaceId?` — no schema addition needed there, only the sidecar field)
- [x] T003 [P] Add `workspaceLimit` field to the `PLANS` record in `src/planconfig.ts` with values: `none: 1`, `starter: 1`, `pro: 1`, `scale: 10` per `data-model.md` section 6
- [x] T004 [P] Add the three composite indexes (`generations` × `workspaceId+timestamp`, `generations` × `reassignedFromWorkspaceId+timestamp`, `workspaces` collectionGroup × `deletedAt`) to `firestore.indexes.json` per `data-model.md` section 7
- [x] T005 [P] Add AR and EN i18n keys for all 10 new user-facing strings (switch-guard dialog × 5, scale-required error, workspace-limit error, insufficient-Meta-role error, no-workspace-access empty state, default-undeletable error) to `src/i18n.tsx` per `research.md` R9
- [x] T006 Create the empty `functions/src/workspaces/` module with barrel `index.ts` that re-exports from `workspacePolicy.ts`, `metaRoleProbe.ts`, `auditLog.ts`, and `workspacePurge.ts` (files themselves populated in later phases)
- [x] T007 [P] Create the frontend service facade `src/services/workspaceService.ts` that wraps `httpsCallable` for each of the 9 workspace callables with typed request/response shapes imported from the types extended in T001

**Checkpoint**: Types compile cleanly (`npm run build` passes), `firestore.indexes.json` is valid, no runtime behavior change yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Policy helpers, Meta role probe, audit-write helper, and security rules — shared across every callable that follows. **CRITICAL**: no user-story phase can begin until this phase is complete.

- [x] T008 [P] Implement `functions/src/workspaces/workspacePolicy.ts` exporting `assertOwner(auth, workspaceId)`, `assertScalePlan(uid)`, `assertWorkspaceActive(workspaceDoc)`, `assertWorkspaceLimit(uid)`, and `resolveDefaultWorkspaceId(uid)` — each throws a typed `HttpsError` with the error codes listed in `plan.md#Phase 1 — section 2` when preconditions fail
- [x] T009 [P] Implement `functions/src/workspaces/metaRoleProbe.ts` exporting `probeMetaRole(userAccessToken, adAccountId): Promise<'ADMIN' | 'ADVERTISER' | 'INSUFFICIENT'>` per `research.md` R1 — calls Meta Marketing API v20 `GET /{ad-account-id}?fields=user_role`, maps `ADMIN`/`ADVERTISER` to allow, everything else (including `ANALYST`, `FINANCE_*`, `EMPLOYEE`, or 4xx responses) to `'INSUFFICIENT'`
- [x] T010 [P] Implement `functions/src/workspaces/auditLog.ts` exporting `writeAuditEntry(txn, { ownerUid, actorUid, targetMemberUid, targetMemberEmail, workspaceId, workspaceNameAtEvent, action, planSnapshot })` — transactional write to `users/{ownerUid}/workspace_access_audit/{entryId}` with deterministic `{timestampMs}_{6char}` ID per `research.md` R10
- [x] T011 Extend `firestore.rules` to permit team-member reads of `users/{ownerUid}/workspaces/{workspaceId}` when the member's `workspaceAccess` array contains that ID AND the workspace is active, and to restrict `users/{ownerUid}/workspace_access_audit/**` reads to the owner only per `data-model.md` section 8 — deploy to emulator and confirm
- [x] T012 [P] [US1] Contract test — `functions/src/__tests__/workspace.test.ts`: scaffold the test file with Firebase Test SDK harness and helpers `createScaleUser()`, `createProUser()`, `seedDefaultWorkspace()`, `seedWorkspace()`, `seedTeamMember()` — no individual test cases yet (those go in later phases)

**Checkpoint**: Shared helpers are importable, security rules pass emulator checks, test harness is ready.

---

## Phase 3: User Story 1 — Scale owner creates, edits, and deletes workspaces (Priority: P1) 🎯 MVP

**Goal**: A Scale-plan owner can CRUD workspaces. Below-Scale is blocked; default is undeletable; deletion is soft with a 30-day retention window; restore is lossless within the window.

**Independent Test**: Per `spec.md` User Story 1 Independent Test — a Scale owner creates a new workspace and confirms it appears in the switcher. Attempts to delete the default fail. Deletes a non-default workspace; its generations remain under the default. A Pro owner attempting to create gets an upgrade prompt. Restore within window makes the workspace reappear and its generations revert.

### Tests for User Story 1

> Write these FIRST, ensure they FAIL before implementing the callables in T019–T024.

- [x] T013 [P] [US1] Contract test for `createWorkspace` — below-Scale plan → `permission-denied: scale_plan_required` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T014 [P] [US1] Contract test for `createWorkspace` — 11th workspace on Scale → `failed-precondition: workspace_limit_reached` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T015 [P] [US1] Contract test for `createWorkspace` — happy path on Scale → returns new workspaceId, doc written with `deletedAt: null` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T016 [P] [US1] Contract test for `updateWorkspace` — partial field write leaves unsupplied fields untouched (LWW per R5) (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T017 [P] [US1] Contract test for `deleteWorkspace` — default workspace → `failed-precondition: default_workspace_undeletable` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T018 [P] [US1] Contract test for `deleteWorkspace` + `restoreWorkspace` round-trip — delete non-default with 3 tagged generations, verify `deletedAt` set and generations reassigned to default; then restore, verify `deletedAt` cleared and generations revert via `reassignedFromWorkspaceId` sidecar (add to `functions/src/__tests__/workspace.test.ts`)

### Implementation for User Story 1

- [x] T019 [US1] Implement `createWorkspace` onCall in `functions/src/index.ts` per `contracts/createWorkspace.md` — uses `assertScalePlan` + `assertWorkspaceLimit` from T008, writes to `users/{uid}/workspaces/{autoId}` with `deletedAt: null`
- [x] T020 [US1] Implement `updateWorkspace` onCall in `functions/src/index.ts` per `contracts/updateWorkspace.md` — partial Firestore `.update()`, rejects attempts to write `isDefault`, `createdAt`, `deletedAt`, or any Meta field
- [x] T021 [US1] Implement `deleteWorkspace` onCall (Phase A — synchronous mark) in `functions/src/index.ts` per `contracts/deleteWorkspace.md` — verifies non-default, sets `deletedAt = serverTimestamp()` and `pendingReassign = true`
- [x] T022 [P] [US1] Implement the delete-cascade Firestore trigger `onWorkspaceDeletedAt` in `functions/src/workspaces/workspacePurge.ts` — paginated reassign of generations and saved projects to default with `reassignedFromWorkspaceId` sidecar, also moves team-member `workspaceAccess` entries into `removedWorkspaceAccessByDelete` sidecar, clears `pendingReassign` when done
- [x] T023 [US1] Implement `restoreWorkspace` onCall (Phase A — synchronous clear) in `functions/src/index.ts` per `contracts/restoreWorkspace.md` — verifies `deletedAt` within 30 days, clears `deletedAt`, sets `pendingRestore = true`
- [x] T024 [P] [US1] Implement the restore-cascade Firestore trigger `onWorkspaceRestored` in `functions/src/workspaces/workspacePurge.ts` — reverses T022's cascade via `reassignedFromWorkspaceId` and `removedWorkspaceAccessByDelete` lookups, clears `pendingRestore`
- [x] T025 [P] [US1] Implement the scheduled `purgeExpiredWorkspaces` function in `functions/src/workspaces/workspacePurge.ts` per `contracts/purgeExpiredWorkspaces.scheduled.md` — daily 04:00 UTC, `collectionGroup('workspaces').where('deletedAt', '<=', now - 30d)`, batched hard deletes of workspace docs (audit entries preserved)
- [x] T026 [P] [US1] Contract test for scheduled purge — set `deletedAt = now - 31d` on a seeded workspace, invoke handler, verify doc is hard-deleted and its audit entries remain (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T027 [US1] Register the delete-cascade trigger, restore-cascade trigger, and scheduled purge in the `functions/src/index.ts` export block so they actually deploy
- [x] T028 [US1] Extend `src/components/WorkspaceSettingsModal.tsx` with a "Create Workspace" entry point (button, name + brandName + brand colors + logoUrl form) that calls `workspaceService.createWorkspace()`; disable the button and show an "Upgrade to Scale to add workspaces" tooltip when `billingState.plan !== 'scale'` per FR-002 and Principle XI (frontend also enforces)
- [x] T029 [US1] Extend `src/components/WorkspaceSettingsModal.tsx` with a "Delete Workspace" button; disabled for the default workspace; on confirm calls `workspaceService.deleteWorkspace()` and shows a confirmation dialog with copy "This workspace will be hidden immediately and permanently deleted in 30 days. Contact support if you need to restore it."
- [x] T030 [US1] Update `src/components/WorkspaceSwitcher.tsx` to filter out workspaces where `deletedAt` is set (defensive — server-side filter is primary; client matches per R7)
- [x] T031 [US1] Wire store loader in `src/store.ts` to hydrate the Zustand `workspaces[]` array from the live `onSnapshot` on `users/{uid}/workspaces` filtered by `deletedAt == null`, replacing the previous client-only shape

**Checkpoint**: A Scale owner can create, update, and delete workspaces end-to-end. Deleted workspaces disappear from the switcher, their generations live under default, and restore (via admin/support call) brings everything back. Pro/Starter users see the Scale-upgrade prompt. All 8 contract tests green.

---

## Phase 4: User Story 2 — Per-workspace Meta ad account linking (Priority: P1)

**Goal**: Each workspace can bind to exactly one Meta ad account at Advertiser-or-higher; generations published from that workspace target the bound account.

**Independent Test**: Per `spec.md` User Story 2 Independent Test — Scale owner with ≥2 connected Meta ad accounts picks one for workspace B, sees the name displayed in settings, publishes an ad from B and verifies the push targets the linked account. Disconnect works. Linking an account ID not in their connected accounts is rejected. Linking at Analyst-or-lower is rejected with an explanatory error.

### Tests for User Story 2

- [x] T032 [P] [US2] Contract test for `linkMetaAccountToWorkspace` — ad account ID not in connected accounts → `failed-precondition: meta_account_not_connected` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T033 [P] [US2] Contract test for `linkMetaAccountToWorkspace` — Meta role probe returns `'INSUFFICIENT'` → `failed-precondition: insufficient_meta_role` (mock `probeMetaRole` in test) (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T034 [P] [US2] Contract test for `linkMetaAccountToWorkspace` — Meta role probe returns `'ADVERTISER'` → `ok`, workspace doc has the three Meta fields written (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T035 [P] [US2] Contract test for `unlinkMetaAccountFromWorkspace` — clears the three Meta fields; idempotent on already-unlinked (add to `functions/src/__tests__/workspace.test.ts`)

### Implementation for User Story 2

- [x] T036 [US2] Implement `linkMetaAccountToWorkspace` onCall in `functions/src/index.ts` per `contracts/linkMetaAccountToWorkspace.md` — verifies ownership + active + connected-ad-account membership, calls `probeMetaRole` from T009, writes the three Meta fields to the workspace doc
- [x] T037 [US2] Implement `unlinkMetaAccountFromWorkspace` onCall in `functions/src/index.ts` per `contracts/unlinkMetaAccountFromWorkspace.md` — clears the three Meta fields
- [x] T038 [US2] Register both callables in the `functions/src/index.ts` export block
- [x] T039 [US2] Extend `src/components/WorkspaceSettingsModal.tsx` with a "Meta Ad Account" section — dropdown populated from `metaService.getConnection().adAccounts`, "Link" button calls `workspaceService.linkMetaAccountToWorkspace()`, displays `metaAdAccountName` + `metaRoleAtLinkTime` when linked, "Disconnect" button calls `workspaceService.unlinkMetaAccountFromWorkspace()`
- [x] T040 [US2] In `src/components/WorkspaceSettingsModal.tsx`, map the `failed-precondition: insufficient_meta_role` error to the AR/EN i18n strings from T005 with a "Go to Meta Business Manager" link (href to `https://business.facebook.com/`)
- [x] T041 [US2] Empty-state guard in `src/components/WorkspaceSettingsModal.tsx` — if `metaService.getConnection()` returns no connection or zero ad accounts, show "Connect Meta first" prompt instead of an empty dropdown per FR-012 acceptance scenario 4
- [x] T041a [US2] Reconnect-prompt guard for broken links — in `src/components/WorkspaceSettingsModal.tsx` AND at the Step 4 Meta-push entry point in `src/App.tsx`, detect the "stored but broken" state: workspace has `metaAdAccountId` set but either (a) `metaService.getConnection()` returns no connection, (b) the stored `metaAdAccountId` no longer appears in the connected ad accounts list, or (c) the workspace-level re-probe in T051 returned `'INSUFFICIENT'` at push. Render a "Reconnect Meta or re-link this workspace" banner with a button that opens the Meta OAuth flow. Do NOT auto-unlink the stored reference. Fulfills FR-012.
- [x] T041b [US2] Contract test for the stored-but-broken Meta path — in `functions/src/__tests__/workspace.test.ts`, seed a workspace with a `metaAdAccountId` whose ID is no longer in the user's connected accounts, attempt to publish a generation, verify `failed-precondition: meta_connection_missing` (new error code) OR `failed-precondition: insufficient_meta_role` depending on cause, and verify the stored reference is NOT cleared by the failed publish. Add the matching error code to the generation-payload-extension contract taxonomy.

**Checkpoint**: A Scale owner can link, see-as-linked, and unlink Meta ad accounts per workspace. UI and backend both enforce Advertiser-or-higher. Stored-but-broken Meta links surface a reconnect banner instead of silently failing. All 5 contract tests green.

---

## Phase 5: User Story 3 — Workspace-scoped generations and saved work (Priority: P1)

**Goal**: Every generation is tagged with its workspace; generation and saved-project lists filter by active workspace; Meta push uses the workspace's linked ad account (with re-probe); team members see only their accessible workspaces' work; pre-Phase records fall under default.

**Independent Test**: Per `spec.md` User Story 3 Independent Test — owner makes one generation in each of two workspaces, switches active workspace, and sees only matching work. A team member with access to only workspace A cannot list workspace B's generations even via direct callable with B's ID.

### Tests for User Story 3

- [x] T042 [P] [US3] Contract test for generation callables — request missing `activeWorkspaceId` → `invalid-argument: active_workspace_required` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T043 [P] [US3] Contract test for generation callables — happy path writes `workspaceId` field on the resulting `generations/{id}` doc per `contracts/generation-payload-extension.md` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T044 [P] [US3] Contract test for `getWorkspaceGenerations` — owner query returns generations tagged with that workspace (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T045 [P] [US3] Contract test for `getWorkspaceGenerations` — team member without access → `permission-denied: workspace_access_denied` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T046 [P] [US3] Contract test for `getWorkspaceGenerations` — default-workspace query also surfaces legacy records with null `workspaceId` (FR-015 backfill rule, per R6) (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T047 [P] [US3] Contract test for Meta push — workspace has linked ad account and caller's role re-probe returns `'ADVERTISER'` → push targets the workspace's ad account, not the user-level default (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T048 [P] [US3] Contract test for Meta push — post-link role downgrade, re-probe returns `'INSUFFICIENT'` → `failed-precondition: insufficient_meta_role` per edge case in spec (add to `functions/src/__tests__/workspace.test.ts`)

### Implementation for User Story 3

- [x] T049 [US3] Extend every generation onCall handler (`generateHooks`, `generateConcepts`, `generateImage`, `generateCaption`, `generateCarouselSlides`, `generateBatch`) in `functions/src/index.ts` to require `activeWorkspaceId` in the request payload per `contracts/generation-payload-extension.md` — throw `invalid-argument: active_workspace_required` if missing; verify workspace is active and caller has access
- [x] T050 [US3] In `functions/src/generators.ts`, ensure every generation-record write includes `workspaceId: request.activeWorkspaceId` so the field is persisted on `generations/{genId}`
- [x] T051 [US3] In `functions/src/generators.ts`, augment Meta push logic: read `workspace.metaAdAccountId`; if present, call `probeMetaRole` (re-probe, per R1); if role permits, target that ad account, else throw `failed-precondition: insufficient_meta_role`; if absent, fall back to the user-level default per `contracts/generation-payload-extension.md` section "Meta push targeting"
- [x] T052 [US3] In `functions/src/resolutionTrace.ts`, add `workspaceId` and `effectiveMetaAdAccountId` fields to the trace entry so Principle VI (auditable hidden layers) is satisfied for workspace-binding decisions
- [x] T053 [US3] Implement `getWorkspaceGenerations` onCall in `functions/src/index.ts` per `contracts/getWorkspaceGenerations.md` — authorization rule (owner OR team-member-with-access), composite-index query, legacy-workspaceId merge for default-workspace queries only
- [x] T054 [US3] Register `getWorkspaceGenerations` in the `functions/src/index.ts` export block
- [x] T055 [US3] In `src/App.tsx`, update every call path that invokes a generation callable (Step 2 hooks, Step 3 concepts, Step 4 image, Step 5 caption, carousel, batch) to include `activeWorkspaceId` from the Zustand store in the request payload
- [x] T056 [US3] In `src/App.tsx`, filter the project list rendering so that only projects with `workspaceId === activeWorkspaceId` are shown (plus projects with no `workspaceId` when activeWorkspaceId is the default, per FR-015) — matches server-side rule from R6
- [x] T057 [US3] In `src/services/workspaceService.ts` or a dedicated `generationService.ts`, expose `listWorkspaceGenerations(workspaceId, cursor)` that calls the new callable and returns the paginated list shape from `contracts/getWorkspaceGenerations.md`

**Checkpoint**: Every new generation carries a `workspaceId`. Generation and saved-project lists filter by active workspace. Pushes target the workspace-linked Meta ad account. Team members cannot peek into workspaces they lack access to. All 7 contract tests green.

---

## Phase 6: User Story 4 — Team workspace access control (Priority: P2)

**Goal**: Team owner assigns a set of workspaces to each team member. Members see only assigned workspaces. Every grant/revoke writes an audit entry the owner can read.

**Independent Test**: Per `spec.md` User Story 4 Independent Test — owner creates 2 workspaces, invites a teammate, grants workspace A only, verifies member sees only A. Adds B, member sees both. Revokes A, member sees only B. Audit log reflects all three changes.

### Tests for User Story 4

- [x] T058 [P] [US4] Contract test for `setTeamMemberWorkspaceAccess` — non-owner caller → `permission-denied: owner_only` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T059 [P] [US4] Contract test for `setTeamMemberWorkspaceAccess` — supplying a workspace ID that is soft-deleted → `failed-precondition: invalid_workspace_id` (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T060 [P] [US4] Contract test for `setTeamMemberWorkspaceAccess` — diff computation writes one audit entry per granted ID and one per revoked ID, none for unchanged IDs (add to `functions/src/__tests__/workspace.test.ts`)
- [x] T061 [P] [US4] Contract test for `getWorkspaceAccessAuditLog` — owner read returns entries newest-first with server-assigned timestamps; non-owner → `permission-denied: owner_only` (add to `functions/src/__tests__/workspace.test.ts`)

### Implementation for User Story 4

- [x] T062 [US4] Implement `setTeamMemberWorkspaceAccess` onCall in `functions/src/index.ts` per `contracts/setTeamMemberWorkspaceAccess.md` — owner-only, computes diff, updates `users/{ownerUid}/team/{memberDocId}.workspaceAccess`, writes one audit entry per grant and revoke in a single transaction using `writeAuditEntry` from T010
- [x] T063 [US4] Implement `getWorkspaceAccessAuditLog` onCall in `functions/src/index.ts` per `contracts/getWorkspaceAccessAuditLog.md` — owner-only read, optional `filterMemberUid` / `filterWorkspaceId` server-side filters, paginated
- [x] T064 [US4] Register both callables in the `functions/src/index.ts` export block
- [x] T065 [US4] Extend `src/pages/Team.tsx` with a per-member workspace access matrix — one row per member, one checkbox per workspace; "Save" calls `workspaceService.setTeamMemberWorkspaceAccess()` with the new array; shows a subtle "Changes will take effect on the member's next action" hint
- [x] T066 [US4] In `src/components/WorkspaceSwitcher.tsx`, filter the displayed workspace list using the current user's `workspaceAccess` when `billingState.isTeamMember === true`; owners see everything (R7 — dual enforcement with server)
- [x] T067 [US4] In `src/components/WorkspaceSwitcher.tsx`, add the "No workspace access — ask your team owner" empty state (using the i18n key from T005) when the filtered list is empty for a team member
- [x] T068 [P] [US4] Create `src/components/WorkspaceAccessAuditPanel.tsx` — minimal owner-only list component that calls `workspaceService.getWorkspaceAccessAuditLog()` and renders a flat table (timestamp, actor, target member, workspace, action); wire into the existing `Team.tsx` page behind an "View access history" toggle (no dedicated route this phase)
- [x] T069 [US4] Update `src/services/workspaceService.ts` to expose `setTeamMemberWorkspaceAccess` and `getWorkspaceAccessAuditLog` wrappers
- [x] T070 [US4] In `src/App.tsx` (or wherever the member's active-workspace state is initialized), if the active workspace is no longer in the member's `workspaceAccess`, fall back to the first accessible workspace or the "no access" state per FR-020 acceptance scenario 4

**Checkpoint**: Owner can grant and revoke per-member workspace access. Members' switchers filter to permitted workspaces only. Audit log shows every grant/revoke for owner review. All 4 contract tests green.

---

## Phase 7: User Story 5 — Mid-generation workspace switch guard (Priority: P2)

**Goal**: Switching workspace with in-progress work prompts with Save / Discard / Cancel. Save persists a draft against the current workspace. No silent data loss.

**Independent Test**: Per `spec.md` User Story 5 Independent Test — begin a generation, enter data in Step 2, click switcher. Dialog appears. Cancel leaves state unchanged. Discard clears draft. Save triggers draft save before switch.

### Tests for User Story 5

- [x] T071 [P] [US5] Unit test for the `hasInProgressWork` predicate (derived from R8) in `src/__tests__/workspace.test.tsx` — exhaustive input-state table: every per-field "has data" → predicate true; all empty → predicate false
- [x] T072 [P] [US5] Component test for `WorkspaceSwitcher.tsx` switch-guard dialog in `src/__tests__/workspace.test.tsx` — with dirty state, clicking a different workspace opens the dialog with 3 buttons; Cancel does nothing; Discard clears state then switches; Save calls `saveProjectToDB` then switches

### Implementation for User Story 5

- [x] T073 [US5] Add the `hasInProgressWork` selector to `src/store.ts` implementing the predicate in `research.md` R8 (covers `inputs`, `tovText`, `conceptsText`, `buildPlan`, `mockupHistory`, `captionText`, `batchResults`, `carouselSlides`)
- [x] T074 [US5] Extract the existing `saveProjectToDB` helper path (currently inline in `src/App.tsx` per `docs/LAUNCH_MATRIX.md` Phase 13 notes) into a named export so the switch guard can invoke it directly — DO NOT change its behavior, only its callability
- [x] T075 [US5] Create `src/components/WorkspaceSwitchGuard.tsx` — a small controlled dialog component with 3 buttons (Save & Switch / Discard & Switch / Cancel) using the i18n keys from T005, accepts `isOpen`, `targetWorkspaceId`, `onSaveAndSwitch`, `onDiscardAndSwitch`, `onCancel` props
- [x] T076 [US5] Extend `src/components/WorkspaceSwitcher.tsx` — on workspace-pick event, read `hasInProgressWork` from store; if true, open the guard dialog; if false, switch immediately (FR-023)
- [x] T077 [US5] Wire the guard's handlers in `src/components/WorkspaceSwitcher.tsx`: Save → call the extracted `saveProjectToDB`, then `setActiveWorkspaceId(target)`; Discard → clear the generation state slices in Zustand, then `setActiveWorkspaceId(target)`; Cancel → close dialog, leave state untouched

**Checkpoint**: Switching workspace mid-generation prompts. Save persists a draft tagged with the previous workspace. No silent data loss. All 2 unit/component tests green.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Deploy config, verify quickstart, add the Arabic/downgrade smokes as formal checks, and one-line cleanup items.

- [ ] T078 [P] Deploy the new composite indexes: `firebase deploy --only firestore:indexes` against the dev project; confirm no errors in Firebase console
- [ ] T079 [P] Deploy the updated security rules: `firebase deploy --only firestore:rules`; verify via rules playground that the new team-member-with-access read predicate works as in `data-model.md` section 8
- [ ] T080 Run the 8-step manual smoke in `specs/012-workspace-logic/quickstart.md` section 3 end-to-end on the emulator with a Scale user and at least one Pro user
- [ ] T081 Run the Arabic-language smoke (`quickstart.md` section 4) — verify all 10 new user-facing strings from T005 render correctly in Arabic with proper RTL direction
- [ ] T082 Run the downgrade smoke (`quickstart.md` section 5) — 3 workspaces on Scale, downgrade to Pro; confirm existing workspaces remain editable but `createWorkspace` is now refused
- [ ] T083 Run the scheduled-purge verification (`quickstart.md` section 6) — set `deletedAt = now - 31d` on a seed workspace, manually trigger `purgeExpiredWorkspaces`, confirm hard delete and audit preservation
- [ ] T084 [P] Run the full backend test suite `cd functions && npm test` and confirm every test added in Phases 2–7 passes; fix any flakes
- [ ] T085 [P] Run `npm run lint` and `npm run build` at the repo root; fix any new warnings introduced in `src/**` changes from Phases 3–7
- [ ] T086 [P] Update `docs/LAUNCH_MATRIX.md` Phase 12 rows 12.1–12.12 — mark each row complete with a pointer to the task ID(s) that fulfilled it; this closes the loop with the launch-matrix single source of truth
- [ ] T087 Run `/speckit.analyze` to verify cross-artifact consistency across `spec.md`, `plan.md`, and `tasks.md`; address any findings it flags

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001–T007 can start immediately
- **Foundational (Phase 2)**: depends on Phase 1 types (T001) and service facade (T007); T008–T012 start once types compile
- **Phase 3 (US1 — CRUD)**: depends on Foundational; unblocks the switcher / settings UI for every later phase
- **Phase 4 (US2 — Meta link)**: depends on Foundational + Phase 3 (uses the `updateWorkspace` path + settings modal)
- **Phase 5 (US3 — scoped data)**: depends on Foundational only; can run parallel to Phase 4 at the backend level (different callables) but shares `WorkspaceSettingsModal.tsx` if UI changes collide — in practice sequential
- **Phase 6 (US4 — team access)**: depends on Foundational; may run parallel to Phase 5 at the backend level
- **Phase 7 (US5 — switch guard)**: depends on Foundational + Phase 3 (switcher must exist); mostly frontend; parallel-safe with Phases 4/5/6 in different files
- **Phase 8 (Polish)**: depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: no dependencies on other stories — this is the MVP
- **US2 (P1)**: depends on US1 (needs a non-default workspace to link against)
- **US3 (P1)**: depends on US1 (needs workspaceId tagging targets); orthogonal to US2 at the backend test level
- **US4 (P2)**: depends on US1 (needs workspaces to grant); compatible with US2 and US3 already complete
- **US5 (P2)**: depends on US1 (switcher must work); compatible with all other stories

### Within Each User Story

- Tests are written FIRST (T013–T018 for US1, etc.) — expect them to FAIL before implementation lands
- Models / types (Phase 1) before services (Phase 2)
- Services (Phase 2) before callables (Phases 3–7)
- Callables before UI components that consume them

### Parallel Opportunities

- **Phase 1**: T001–T005 and T007 are all different files → all [P]
- **Phase 2**: T008, T009, T010 are three separate new files → [P]; T011 touches `firestore.rules` (sequential)
- **Phase 3 tests**: T013–T018 all add test cases to the same file `workspace.test.ts` but to independent `describe` blocks with no shared mutable state → marked [P] (safe to parallelize by authoring, but `git` merges sequentially)
- **Phase 3 implementation**: T019–T023 all touch `functions/src/index.ts` → NOT [P] (same file); T022, T024, T025 touch `workspacePurge.ts` → [P] because each is a different named export
- **Phase 4**: T032–T035 [P] (tests); T036–T038 all touch `index.ts` — sequential
- **Phase 5**: T042–T048 [P] (tests)
- **Phase 6**: T058–T061 [P] (tests); T068 [P] (new file)
- **Phase 7**: T071–T072 [P] (tests); T073 / T075 different files [P]
- **Phase 8**: T078, T079, T084, T085, T086 are independent; [P]

### Cross-file conflicts (NOT [P])

- `functions/src/index.ts`: T019, T020, T021, T023, T027, T036, T037, T038, T049, T053, T054, T062, T063, T064 — all sequential
- `src/components/WorkspaceSettingsModal.tsx`: T028, T029, T039, T040, T041 — all sequential
- `src/components/WorkspaceSwitcher.tsx`: T030, T066, T067, T076, T077 — all sequential
- `functions/src/generators.ts`: T050, T051 — sequential
- `src/App.tsx`: T055, T056, T070 — sequential
- `src/types.ts`: T001, T002 — sequential despite the [P] marker (file is small and both tasks are small; merging is trivial)

---

## Parallel Example: User Story 1 tests

```text
# Launch all 6 US1 contract tests in parallel (different describe blocks, no shared mutable state):
Task: "Contract test for createWorkspace — below-Scale → scale_plan_required (T013)"
Task: "Contract test for createWorkspace — 11th workspace → workspace_limit_reached (T014)"
Task: "Contract test for createWorkspace — happy path (T015)"
Task: "Contract test for updateWorkspace — partial field write (T016)"
Task: "Contract test for deleteWorkspace — default-undeletable (T017)"
Task: "Contract test for delete + restore round-trip (T018)"
```

## Parallel Example: Foundational helpers

```text
# Launch the three helper modules in parallel — no shared files:
Task: "Implement workspacePolicy.ts (T008)"
Task: "Implement metaRoleProbe.ts (T009)"
Task: "Implement auditLog.ts (T010)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only — workspace CRUD)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational) — types, helpers, security rules, test harness in place
2. Complete Phase 3 (US1) — Scale owner can create / edit / delete / restore workspaces; cascade works; scheduled purge runs
3. **STOP and VALIDATE** — run the first 3 steps of the quickstart manual smoke + all Phase 3 contract tests green
4. Deploy / demo — this alone is a shippable improvement over the client-only workspace shell

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 (P1) → test independently → demo (MVP — workspace CRUD)
3. Add US2 (P1) → test independently → demo (Meta linking per workspace)
4. Add US3 (P1) → test independently → demo (scoped generations, correct Meta push)
5. Add US4 (P2) → test independently → demo (team access control + audit)
6. Add US5 (P2) → test independently → demo (switch guard)
7. Phase 8 polish → final ship

Each story produces a tangible improvement on its own and doesn't rely on later stories for soundness.

### Parallel Team Strategy

With 3 developers after Phase 2 completes:

- **Dev A**: US1 → US5 (frontend-heavy track: settings modal, switcher, switch guard)
- **Dev B**: US2 → US3 (backend-heavy track: Meta role probe, generation payload extension)
- **Dev C**: US4 (team access + audit — mostly independent module)

Dev A and Dev C never conflict on files. Dev B's `index.ts` edits conflict with Dev A's; coordinate merges.

---

## Notes

- Every task has an explicit file path; no task says "update some file somewhere."
- Contract tests are written BEFORE the callable they cover (per Principle IX — proof required).
- AR/EN i18n strings ship in the same commit as the UI surface that uses them (Principle V).
- No task bypasses security rules, skips auth, or disables frontend gating — Principle XI enforced throughout.
- `functions/src/index.ts` becomes a serialization point for many tasks; plan merges accordingly rather than trying to parallelize them.
- Soft-delete retention window is server-time-measured; never trust client clock.
- The scheduled purge is deliberately sequenced AFTER Phase 14's `metaDailySync` (03:00 UTC) to avoid scheduling collisions.

---

## Task Count Summary

| Phase | Tasks | Notes |
|---|---:|---|
| Phase 1: Setup | 7 (T001–T007) | Types, i18n, indexes, service facade |
| Phase 2: Foundational | 5 (T008–T012) | Policy, role probe, audit writer, rules, test harness |
| Phase 3: US1 (MVP) | 19 (T013–T031) | CRUD + cascade + scheduled purge + settings/switcher UI |
| Phase 4: US2 | 12 (T032–T041b) | Meta link + unlink + settings UI + reconnect-prompt guard |
| Phase 5: US3 | 16 (T042–T057) | Generation payload ext + workspace-scoped list + Meta push targeting |
| Phase 6: US4 | 13 (T058–T070) | Team access + audit log + Team page matrix |
| Phase 7: US5 | 7 (T071–T077) | Switch guard predicate + dialog + wiring |
| Phase 8: Polish | 10 (T078–T087) | Deploy + smokes + lint + matrix update |
| **Total** | **89 tasks** | **MVP (Phases 1–3): 31 tasks** |

Each user story has a test count matching its acceptance-scenario count in `spec.md`:
- US1: 6 tests (T013–T018) for 7 acceptance scenarios (scenario 5 — update — is covered by T016)
- US2: 4 tests (T032–T035) for 6 acceptance scenarios (scenarios 1–3 and 5–6 map; scenario 4 is UI empty state — covered by T041)
- US3: 7 tests (T042–T048) for 5 acceptance scenarios plus the post-link-downgrade edge case
- US4: 4 tests (T058–T061) for 5 acceptance scenarios
- US5: 2 tests (T071–T072) for 5 acceptance scenarios

Suggested MVP scope: **Phases 1 + 2 + 3** (T001–T031) — a self-contained, independently deployable slice that delivers the core Scale-plan differentiator (multi-workspace CRUD) without needing Meta linking, team scoping, or the switch guard.
