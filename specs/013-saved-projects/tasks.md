---
description: "Task list for Phase 13 — Saved Projects"
---

# Tasks: Saved Projects (Phase 13)

**Branch**: `013-saved-projects` | **Date**: 2026-04-22
**Input**: Design documents from `/specs/013-saved-projects/`
**Prerequisites**: plan.md ✓ · spec.md ✓ · research.md ✓ · data-model.md ✓ · contracts/ ✓ · quickstart.md ✓

**Tests**: Backend Node `assert/strict` fixture tests are included (matches the existing `functions/src/__tests__/` pattern and is required by Constitution principle IX). No frontend test runner exists in the project; frontend verification follows `quickstart.md`.

**Organization**: Tasks are grouped by user story (US1–US7 from `spec.md`) so each story can be implemented, tested, and shipped independently.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Different file, no dependency on incomplete tasks → safe to run in parallel.
- **[Story]**: Maps task to a user story (US1–US7) for traceability. Setup, Foundational, and Polish phases have no story label.

## Path Conventions

This is a **web application** (split frontend `src/` + backend `functions/`) per `plan.md` Project Structure. All paths below are repository-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration changes that unblock the foundational and story phases. These are quick and have no logical dependencies between them.

- [x] T001 [P] Add three composite indexes to `firestore.indexes.json` per `data-model.md` § Indexes: `(workspaceId ASC, timestamp DESC, id DESC)`, `(status ASC, timestamp DESC, id DESC)`, and `(workspaceId ASC, status ASC, timestamp DESC, id DESC)` on `users/{uid}/projects`.
- [x] T002 [P] Add the V1 thumbnail rule block to `storage.rules` per `contracts/storage-rules.md` (owner-only `read, write` on `users/{uid}/projects/{projectId}/thumbnail.{jpg|png}` with 256 KB size cap, jpg/png ext whitelist).
- [x] T003 [P] Create the i18n strings file at `src/i18n/savedProjects.ts` with empty exports for `statusLabels`, `filterLabels`, `deleteDialog`, `saveIndicator`, and `planCapBlocker` (entries filled by per-story tasks).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared building blocks every user story depends on. **CRITICAL**: no `[US*]` task may begin until this phase is complete.

- [x] T004 Extend the `SavedProject` interface in `src/types.ts` per `contracts/saved-project-shape.md`: add optional `status: 'draft' | 'rendered' | 'published'`, optional `thumbnailUrl: string`, and document existing `metaAdId` field. No removals; existing fields preserved exactly.
- [x] T005 [P] Create `deriveStatus(prev, project)` pure function in `src/lib/projectStatus.ts` per `data-model.md` § V1 — returns `Math.max(rank(prev ?? 'draft'), rank(derivedFromData))` over `draft=0, rendered=1, published=2`. No React imports; no side effects.
- [x] T006 [P] Create the server-side mirror of T005 at `functions/src/savedProjects/projectStatus.ts` with byte-for-byte equivalent logic (the parity test in T011 enforces the equivalence).
- [x] T007 [P] Create `resolveCoverImage(project)` in `src/lib/projectCoverImage.ts` per `data-model.md` § V2 with branch order carousel → batch → single (so format-switched projects use slide 1).
- [x] T008 [P] Create the server-side mirror of T007 at `functions/src/savedProjects/projectCoverImage.ts`.
- [x] T009 [P] Create `stepsWithData(project)` in `src/lib/projectStepsData.ts` per `data-model.md` § V4 — returns `{ step1, step2, step3, step4, step5 }` booleans.
- [x] T010 [P] Create the server-side mirror of T009 at `functions/src/savedProjects/projectStepsData.ts`.
- [x] T011 Create the shared fixture set at `functions/src/__tests__/__fixtures__/savedProjects.fixtures.ts` exporting at least: `legacyProjectNoStatusNoRender`, `singleFormatRenderedNoMeta`, `carouselRenderedNoMeta`, `batchRenderedNoMeta`, `formatSwitchedSingleToCarousel`, `publishedThenMetaRemoved`. These fixtures back parity tests for T005/T006 and the deeper US-phase tests.
- [x] T012 Add `functions/src/__tests__/savedProjects.projectStatus.test.ts` using `node:assert/strict` covering the published-latch (`published + meta-removed → published`), legacy → draft, render → rendered, meta → published, format-switch preservation. Run via the existing `cd functions && npm test`.

**Checkpoint**: Foundation ready — all `[US*]` phases below can now run in parallel (subject to within-story dependencies).

---

## Phase 3: User Story 1 — Status & thumbnail (Priority: P1) 🎯 MVP-anchor

**Goal**: Every saved project carries a derived `status` (`draft` / `rendered` / `published`, with `published` as a one-way latch) and a durable thumbnail of its cover image. Project list shows colour-plus-text badges and the cover image (or placeholder) per project.

**Independent Test**: Quickstart Story 1 — create a draft, render it, push to Meta, disconnect Meta, reload across devices. Badges and thumbnails behave per FR-001 / FR-002 / FR-004 / FR-005.

### Implementation for User Story 1

- [x] T013 [P] [US1] Create `uploadAndPersistThumbnail(uid, projectId, sourceUrl)` helper at `src/lib/projectThumbnail.ts` per `research.md` R4 — fetches `sourceUrl` (handles `data:` and remote URLs), client-side downscales to ≤ 512×512 jpg ≤ 256 KB, uploads to `users/{uid}/projects/{projectId}/thumbnail.jpg` via the `firebase/storage` SDK, returns the `getDownloadURL()` string. Idempotent for already-Storage URLs.
- [x] T014 [US1] Modify `saveProjectToDB(project)` callsite path in `src/App.tsx` (around line 303) to compute `status` via `deriveStatus(project.status, project)` before the IndexedDB `put()`.
- [x] T015 [US1] Modify `saveProjectToFirestore(userId, project)` in `src/App.tsx` (around line 356) to compute `status` via `deriveStatus(project.status, project)` and persist the derived value alongside the existing base64-strip behaviour.
- [x] T016 [US1] In `src/App.tsx` Step-4 render-completion handler, call `resolveCoverImage(project)`; when it returns a non-Storage URL, fire-and-forget `uploadAndPersistThumbnail(...)`, then on resolve set `project.thumbnailUrl` and trigger a follow-up save (the two-phase write in `research.md` R4).
- [x] T017 [P] [US1] Create `ProjectStatusBadge` component at `src/components/SavedProjectsPanel/ProjectStatusBadge.tsx` rendering a colour-plus-short-text-label badge per FR-005, reading labels from `src/i18n/savedProjects.ts`.
- [x] T018 [P] [US1] Add status label entries (`Draft / مسودة`, `Rendered / تم العرض`, `Published / منشور`) to `src/i18n/savedProjects.ts` `statusLabels` export with Tailwind class hints (`bg-gray-100 text-gray-700`, `bg-emerald-100 text-emerald-700`, `bg-blue-100 text-blue-700`).
- [x] T019 [US1] Create `SavedProjectCard` skeleton at `src/components/SavedProjectsPanel/SavedProjectCard.tsx` rendering: 64×64 thumbnail (or placeholder icon when `!thumbnailUrl`), project name, formatted timestamp, `<ProjectStatusBadge>`. RTL-mirror layout via existing `dir`-aware Tailwind classes.
- [x] T020 [US1] Create `SavedProjectsPanel` container at `src/components/SavedProjectsPanel/SavedProjectsPanel.tsx` that reads the current user's projects from existing client state and renders one `<SavedProjectCard>` per project (filters/search wired in US4).
- [x] T021 [US1] Replace the existing inline projects sidebar in `src/App.tsx` (~lines 4849–4975) with `<SavedProjectsPanel />`. Preserve existing prop wiring (active workspace, signed-in user) — UI swap only at this task.
- [x] T022 [US1] Add `SavedProjectListItem.status` always-concrete behaviour: in T015's save path, after Firestore write succeeds, also write back to local IndexedDB (already current behaviour) so the next render reads a consistent status. This satisfies SC-010 for the migration path.

**Checkpoint**: User Story 1 fully testable per Quickstart Story 1. Status badges + thumbnails ship; legacy projects load with derived `draft` status (FR-022) and the placeholder thumbnail (FR-023).

---

## Phase 4: User Story 2 — Plan-cap enforcement (Priority: P1)

**Goal**: A new project save is blocked at `users.savedProjects.length >= PLANS[plan].savedProjectLimit`. Update of an existing project is never blocked. Both client and server enforce.

**Independent Test**: Quickstart Story 2 — Starter at 10 projects, save 11th refused; edit existing succeeds; upgrade Pro then 11th succeeds; downgrade then 12th refused.

### Implementation for User Story 2

- [x] T023 [P] [US2] Create `enforceProjectQuota(uid, plan, isNewProject)` at `functions/src/savedProjects/projectQuota.ts` per `data-model.md` § V3 — txn-safe count over `users/{uid}/projects` plus cap check; throws `HttpsError('failed-precondition', 'QUOTA_EXCEEDED', { plan, limit, current })` when over cap; returns `'OK'` for unlimited and for updates.
- [x] T024 [US2] Add a server-side save-project callable in `functions/src/index.ts` (or wrap an existing project-write callsite, whichever is in use today) that runs `enforceProjectQuota` inside the same Firestore transaction as the project write. Server is the authority per Constitution principle XI.
- [x] T025 [US2] Add a client-side cap precheck in `src/App.tsx` save flow before invoking T024: read `PLANS[currentPlan].savedProjectLimit` from `src/planconfig.ts`, count current projects via the existing `getAllProjectsFromDB(uid)`, and if `isNewProject && count >= limit` show `<PlanCapBlocker>` and abort the save without round-tripping. If the precheck passes but the server returns `QUOTA_EXCEEDED` (race), surface the server's `plan + limit + current` fields verbatim.
- [x] T026 [US2] Wire the `QUOTA_EXCEEDED` server error in `src/App.tsx` save error handler to render `<PlanCapBlocker>` with the server's plan/limit values (so the displayed cap is always authoritative).
- [x] T027 [P] [US2] Create `PlanCapBlocker` component at `src/components/SavedProjectsPanel/PlanCapBlocker.tsx` — inline error block naming the current plan, the cap that was hit, and an "Upgrade plan" / "ترقية الخطة" CTA linking to `/billing`. Reads strings from `src/i18n/savedProjects.ts` `planCapBlocker` export.
- [x] T028 [P] [US2] Add `planCapBlocker` entries to `src/i18n/savedProjects.ts` (Arabic + English, parameterised by plan name and limit).
- [x] T029 [P] [US2] Add quota fixture tests at `functions/src/__tests__/savedProjects.projectQuota.test.ts`: at-cap reject, over-cap update allowed (downgrade tolerated state), Scale unlimited, transaction races safe (two parallel saves at-1-below-cap → one succeeds, one rejected).

**Checkpoint**: Cap-block surfaces both client-side (instant) and server-side (authoritative). Updates always succeed regardless of cap.

---

## Phase 5: User Story 3 — Resume from any completed step (Priority: P1)

**Goal**: Each card's step navigator shows 5 dots reflecting `stepsWithData(project)`. Clicking a filled dot loads the project and lands at that step. Clicking the card body resumes at `project.phase` (existing behaviour preserved). Invalid `targetPhase` falls back silently.

**Independent Test**: Quickstart Story 3 — open a project with steps 1–4 done, click Step 2 dot → loads at Step 2; click card body → loads at Step 4; click Step 5 dot (empty) → no-op.

### Implementation for User Story 3

- [x] T030 [P] [US3] Create `ProjectStepNavigator` component at `src/components/SavedProjectsPanel/ProjectStepNavigator.tsx` rendering 5 dots from `stepsWithData(project)` — filled dot = clickable button with `onResume(targetPhase)`, empty dot = visually disabled `<span>` (no click handler, `aria-disabled`).
- [x] T031 [US3] Modify `loadProject(p)` in `src/App.tsx` (around line 2893) to accept an optional second param `targetPhase?: AppPhase`. After restoring state via the existing path, if `targetPhase` is set AND `stepsWithData(p)[targetPhase]` is `true`, call `setCurrentPhase(targetPhase)`; otherwise fall back to `setCurrentPhase(p.phase)` (FR-010 + FR-011).
- [x] T032 [US3] Wire `<ProjectStepNavigator>` into `<SavedProjectCard>` in `src/components/SavedProjectsPanel/SavedProjectCard.tsx`: render the navigator inside the card; on dot click call `loadProject(project, targetPhase)`.
- [x] T033 [US3] Wire `<SavedProjectCard>` body click handler to call `loadProject(project)` (no second arg) so card-body open continues to land on `project.phase` (existing behaviour preserved).

**Checkpoint**: Step-resume shipped. Definition-of-Done item #16's "can be resumed from any completed step" is now satisfied end-to-end.

---

## Phase 6: User Story 4 — Search & filter (Priority: P2)

**Goal**: Above the list, three composable filters: name search (case-insensitive substring), workspace dropdown (single workspace), status tabs (All / Draft / Rendered / Published). Filters compose; clearing one leaves the others. Published-empty-state nudges Meta-connect when relevant.

**Independent Test**: Quickstart Story 4.

### Implementation for User Story 4

- [x] T034 [P] [US4] Create `ProjectFilters` component at `src/components/SavedProjectsPanel/ProjectFilters.tsx` rendering: a search `<input>`, a workspace `<select>` populated from the user's workspace list, and a horizontal status tab strip (All / Draft / Rendered / Published). Emits `{ search, workspaceId, status }` via `onChange` prop.
- [x] T035 [US4] In `<SavedProjectsPanel>`, hold filter state via `useState<{ search: string; workspaceId: string | 'all'; status: 'all' | ProjectStatus }>` and apply: name `String(p.name).toLowerCase().includes(search.toLowerCase())`, workspace `workspaceId === 'all' || p.workspaceId === workspaceId`, status `status === 'all' || (p.status ?? 'draft') === status`. All three compose with `&&`.
- [x] T036 [US4] Add Published-empty-state to `<SavedProjectsPanel>` per `research.md` R10: when `status === 'published'` and `filteredProjects.length === 0`, render either the Meta-connect CTA (when `!user.metaConnected`) or the neutral empty state (when `user.metaConnected`).
- [x] T037 [P] [US4] Add `filterLabels` entries (search placeholder, workspace dropdown labels, status tab labels, two empty-state copy variants) to `src/i18n/savedProjects.ts` in Arabic + English.

**Checkpoint**: Search + workspace + status filters compose. Published empty-state surfaces the right CTA.

---

## Phase 7: User Story 5 — Delete with confirmation (Priority: P2)

**Goal**: Each card has a delete control. Confirming cascades delete across IndexedDB + Firestore + Storage. Idempotent: re-delete of an already-removed project is a silent success (FR-015).

**Independent Test**: Quickstart Story 5.

### Implementation for User Story 5

- [x] T038 [P] [US5] Create `DeleteProjectDialog` component at `src/components/SavedProjectsPanel/DeleteProjectDialog.tsx` (modal naming the project, irreversibility warning, Cancel + Delete buttons; `onConfirm` and `onCancel` props).
- [x] T039 [P] [US5] Create `deleteThumbnailObject(uid, projectId)` helper at `functions/src/savedProjects/thumbnailDelete.ts` (Storage delete attempting both `.jpg` and `.png` extensions; swallow `object-not-found` only — re-throw other errors).
- [x] T040 [US5] Modify `deleteProject(e, id)` in `src/App.tsx` (around line 2979) to: open `<DeleteProjectDialog>`; on confirm cascade `deleteProjectFromDB(id)` (existing) + `deleteProjectFromFirestore(uid, id)` (existing) + `deleteThumbnailObject(uid, id)` (new from T039 — call from client via `firebase/storage` `deleteObject`, no callable round-trip needed). Update local state; close the dialog.
- [x] T041 [US5] Add a delete-icon button (trash icon, Tailwind `text-red-500`) to `<SavedProjectCard>` in `src/components/SavedProjectsPanel/SavedProjectCard.tsx` that opens `<DeleteProjectDialog>` for that project. Stop click propagation so opening the dialog does not also trigger the card-body click.
- [x] T042 [P] [US5] Add `deleteDialog` entries (title, body, cancel button, delete button) to `src/i18n/savedProjects.ts` in Arabic + English. Body must include the project name placeholder.
- [x] T043 [US5] Wrap each cascade-step deletion in T040 in `try { … } catch (err) { if (err.code !== 'not-found' && err.code !== 'storage/object-not-found') throw err; }` to satisfy FR-015 idempotency.

**Checkpoint**: Delete cascades cleanly across all three storage tiers. Re-delete is safe.

---

## Phase 8: User Story 6 — Continuous auto-save with indicator (Priority: P2)

**Goal**: Background auto-save with 3 s debounce + 30 s ceiling. Header indicator shows `Saving…` / `Saved ✓` / inline-error / persistent-banner per `AutoSaveState`. Local IndexedDB save runs first so cloud failures never lose work. 3-strike escalation surfaces a non-blocking banner with manual retry.

**Independent Test**: Quickstart Story 6 (covers all five FR-016 / FR-017 / FR-018 paths including the offline-induced 3-strike escalation).

### Implementation for User Story 6

- [x] T044 [P] [US6] Create `projectAutoSave` module at `src/lib/projectAutoSave.ts` per `research.md` R5/R6: pure JS module with a debounce-3s + ceiling-30s scheduler, a per-tab failure counter (incremented on cloud-save reject, reset on success), a `subscribe(listener)` API for the React hook, and a `forceFlush()` for the manual retry button. No React deps.
- [x] T045 [P] [US6] Create `useProjectAutoSave` hook at `src/hooks/useProjectAutoSave.ts` that subscribes to T044's events and exposes the current `AutoSaveState` plus a `queue(project)` and `retryNow()` API.
- [x] T046 [US6] Add `saveStatus: AutoSaveState` slice to the Zustand store at `src/store.ts` so the header indicator can subscribe without prop-drilling. Mirror updates from `useProjectAutoSave` into the store.
- [x] T047 [P] [US6] Create `SaveStatusIndicator` component at `src/components/SavedProjectsPanel/SaveStatusIndicator.tsx` rendering the four AutoSaveState variants per `data-model.md` § AutoSaveState — `idle` renders nothing; `saving` renders "Saving…"; `saved` renders "Saved ✓" auto-clearing 2 s after `clearAt`; `transient-error` renders a small inline error icon; `persistent-failure` renders the banner with the manual "Try saving now" button calling `retryNow()`.
- [x] T048 [US6] Mount `<SaveStatusIndicator>` in the application header in `src/App.tsx` (alongside the existing app-shell status surface — confirm by grep for the workspace switcher mount point and place adjacent).
- [x] T049 [US6] Replace the existing phase-change-only draft-save block in `src/App.tsx` (~lines 2390–2428) with a `useProjectAutoSave().queue(currentProject)` call wired to a `useEffect([currentProject])` that fires on any change in Steps 1–5 inputs. Keep the existing draft-naming convention (`📝 {productName}`).
- [x] T050 [US6] In `projectAutoSave` (T044), order each save attempt as: (a) local IndexedDB write (synchronous, never blocked by cloud), then (b) cloud Firestore write through T024's callable. A cloud failure increments the counter; a local failure logs but does not change the indicator state (extremely rare; deferred per `research.md` R5).
- [x] T051 [US6] Implement FR-018 in `projectAutoSave` (T044): hold a `pendingSnapshotId` and a `currentInMemoryId`. When the cloud save resolves for `pendingSnapshotId`, only flip to `saved` if `currentInMemoryId === pendingSnapshotId`; otherwise transition straight back to `saving` for the newer in-memory state. Prevents stale snapshots overwriting fresh edits.
- [x] T052 [P] [US6] Add `saveIndicator` entries (`Saving… / جارٍ الحفظ`, `Saved / تم الحفظ`, transient-error tooltip, persistent-banner copy "Saving to cloud failed — your work is safe locally" / "فشل الحفظ على السحابة — عملك محفوظ محليًا", "Try saving now" / "حاول الحفظ الآن") to `src/i18n/savedProjects.ts`.

**Checkpoint**: Auto-save shipped. Quickstart Story 6's offline-burst scenario passes the persistent-banner test. Local-first ordering makes data loss from tab close effectively impossible inside the SC-006 envelope.

---

## Phase 9: User Story 7 — Team-scoped listing (Priority: P3)

**Goal**: New `getUserProjects` callable returns paginated, workspace-filtered, status-filtered project list for owners and team members. Permission denials leak no project metadata (SC-009). Reuses Phase 12 `resolveCallerScope`.

**Independent Test**: Quickstart Story 7.

### Implementation for User Story 7

- [x] T053 [US7] Create the `getUserProjects` callable at `functions/src/savedProjects/getUserProjects.ts` strictly following `contracts/getUserProjects.md`: validate request shape, run `resolveCallerScope(callerUid)` from the existing Phase-12 `functions/src/workspaces/workspacePolicy.ts`, build the Firestore query with `(timestamp DESC, id DESC)` ordering, encode `nextCursor` as base64 of `{ timestamp, id }`, and project results to `SavedProjectListItem` (use server-side T010 `stepsWithData` for the dot-navigator data).
- [x] T054 [US7] Export `getUserProjects` from `functions/src/index.ts` so the frontend can call it via `httpsCallable(functions, 'getUserProjects')`.
- [x] T055 [US7] Wire `<SavedProjectsPanel>` data source in `src/components/SavedProjectsPanel/SavedProjectsPanel.tsx` to call `getUserProjects` when the current user is detected as a team member (read from `useAppStore` whatever flag identifies a member vs an owner — Phase 12 introduced this). Owners continue to use the existing local IndexedDB + Firestore path. Pass current `workspaceId` and `status` filters through the callable.
- [x] T056 [US7] Add Published / Rendered / Draft tab paginated-load behaviour: when the response has a `nextCursor`, render a "Load more" button at the bottom of the list that calls `getUserProjects` again with the cursor and appends results. Owners use in-memory pagination on the local set; members use the callable.
- [x] T057 [P] [US7] Add `getUserProjects` fixture tests at `functions/src/__tests__/savedProjects.getUserProjects.test.ts` covering all 11 fixtures listed in `contracts/getUserProjects.md` § Test fixtures — including `permission_denied_no_metadata_leak` (asserts the response payload is JSON-strict-equal to the error envelope with no `projects` / `nextCursor` fields).
- [x] T058 [US7] Verify the storage-rules V1 vs V2 decision per `contracts/storage-rules.md` § Decision gate: deploy V1 to a test Firebase project, sign in as a team member, attempt to render an owner's thumbnail URL via `<img src="…">`. If it renders → keep V1 (already shipped via T002). If it 403s → replace `storage.rules` block with the V2 form (team-member-aware) and re-deploy. Document the chosen variant in `contracts/storage-rules.md`.

**Checkpoint**: Team members get workspace-scoped lists with paginated team-owner projects. Permission denials leak nothing.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, instrumentation, and final verification across all stories.

- [x] T059 [P] Add structured `console.info` instrumentation per Constitution principle VI: log status-latch transitions (in `src/lib/projectStatus.ts` and `functions/src/savedProjects/projectStatus.ts`), quota-block events (in `functions/src/savedProjects/projectQuota.ts`), and 3-strike auto-save escalations (in `src/lib/projectAutoSave.ts`). Each log line includes feature tag `phase13` and the relevant ids.
- [x] T060 [P] Remove the now-dead inline projects sidebar code from `src/App.tsx` (~lines 4849–4975) since `<SavedProjectsPanel>` replaced it (T021). Verify no other call sites reference the removed JSX.
- [x] T061 [P] Audit Arabic strings in `src/i18n/savedProjects.ts` against the language-quality contracts from Phase 8 (Fusha vs Egyptian Arabic, no English mixed-in). Cross-check with the existing app's badge/dialog vocabulary for consistency.
- [x] T062 Run `cd functions && npm test` and confirm all new fixture tests pass alongside the existing `contractFixtures.test.ts`. Fix any regressions introduced by T011/T012/T029/T057.
- [x] T063 [P] Run `npm run lint` and `npm run build` (TypeScript compile + Vite build) at the repo root; fix any errors introduced by the new files. Ensure both `src/lib/projectStatus.ts` and `functions/src/savedProjects/projectStatus.ts` compile without unused-export warnings.
- [x] T064 Execute `quickstart.md` end-to-end with two browsers (owner@dev + member@dev). Record pass/fail per Story (1–7). Any failure → file a bug, fix, re-run that Story before sign-off.
- [x] T065 Update `docs/LAUNCH_MATRIX.md` rows 13.1 → 13.10 status notes to mark each row done. Confirm Section 13 Definition-of-Done item #16 is verifiable end-to-end via Stories 1 + 2 + 3.
- [x] T066 Deploy Firestore composite indexes from T001 (`firebase deploy --only firestore:indexes`) and the chosen `storage.rules` variant from T058 (`firebase deploy --only storage`) to the dev project. Verify indexes reach `READY` state before merging.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. **Blocks every `[US*]` phase.**
- **Phase 3 (US1 — P1)**: Depends on Phase 2. Can start immediately after.
- **Phase 4 (US2 — P1)**: Depends on Phase 2. Independent of US1, US3.
- **Phase 5 (US3 — P1)**: Depends on Phase 2. Builds on US1 only for `<SavedProjectCard>` (T032 wires the navigator into the card from T019). If parallelised with US1, US3's T032 must wait for US1's T019.
- **Phase 6 (US4 — P2)**: Depends on Phase 2 and US1 (filters live inside `<SavedProjectsPanel>` from T020).
- **Phase 7 (US5 — P2)**: Depends on Phase 2 and US1 (delete control mounts inside `<SavedProjectCard>` from T019).
- **Phase 8 (US6 — P2)**: Depends on Phase 2 and US2 (T050 / T024 — the auto-save calls the same server save callable that enforces quota).
- **Phase 9 (US7 — P3)**: Depends on Phase 2 and US1 (panel exists). Independent of US4–US6.
- **Phase 10 (Polish)**: Depends on the user stories you ship. Some sub-tasks (T060, T065) depend on US1 only; T066 depends on Phase 1 + the V1/V2 decision in T058.

### Within-story serial chains

- US1: T013 → T016 (upload helper before render-completion handler); T017 + T018 → T019 (badge + strings before card); T019 → T020 → T021 (card → panel → mount).
- US2: T023 → T024 (helper before callable); T024 → T025 → T026 (server callable before client precheck before error wiring); T027 + T028 → T026 (component + strings before wiring).
- US3: T030 + T031 → T032 (navigator + loadProject signature before wiring).
- US5: T038 + T039 + T042 → T040 → T041 (dialog + helper + strings before save-path edit before button mount).
- US6: T044 → T045 → T046 → T047 → T048 (module → hook → store → component → mount); T044 → T050 → T051 (module → ordering → race fix); T044 → T049 (module before edit-trigger wiring).
- US7: T053 → T054 → T055 → T056 (callable → export → frontend wiring → pagination button).

### Parallel Opportunities

- **All [P] tasks within a phase**: safe to run in parallel.
- **Across stories** (with the inter-story dependencies above respected): once Phase 2 completes, US1 + US2 + US3's "early" tasks (the [P] component / helper creations) can start in parallel.
- **Between Polish [P] tasks**: T060, T061, T063 are all independent.

---

## Parallel Example — User Story 1 launch wave

```bash
# After Phase 2 checkpoint, kick off all [P] US1 tasks in parallel:
T013 [P] [US1] uploadAndPersistThumbnail at src/lib/projectThumbnail.ts
T017 [P] [US1] ProjectStatusBadge at src/components/SavedProjectsPanel/ProjectStatusBadge.tsx
T018 [P] [US1] statusLabels strings in src/i18n/savedProjects.ts

# Then serial: T014 → T015 → T016 (App.tsx save-path edits)
# Then T019 (needs T017, T018) → T020 → T021 (panel mount)
```

## Parallel Example — Phase 2 launch wave

```bash
# All foundational [P] tasks safe to run together:
T005 [P] src/lib/projectStatus.ts
T006 [P] functions/src/savedProjects/projectStatus.ts
T007 [P] src/lib/projectCoverImage.ts
T008 [P] functions/src/savedProjects/projectCoverImage.ts
T009 [P] src/lib/projectStepsData.ts
T010 [P] functions/src/savedProjects/projectStepsData.ts
# T004 must precede the [P] burst above (extends the type they all consume).
# T011 and T012 follow once T005/T006 land (fixture set + parity test).
```

---

## Implementation Strategy

### MVP First (Stories 1 + 2 + 3 → Definition-of-Done item #16)

The launch matrix's DoD item #16 — *"Saved projects show thumbnail + status + per-plan project limits, can be resumed from any completed step"* — is satisfied by the three P1 stories. The recommended MVP sequence:

1. Phase 1 + Phase 2 (Setup + Foundational). **Blocking — must finish first.**
2. Phase 3 (US1 — Status & Thumbnail). Validate via Quickstart Story 1.
3. Phase 4 (US2 — Plan Cap). Validate via Quickstart Story 2.
4. Phase 5 (US3 — Step Resume). Validate via Quickstart Story 3.
5. **STOP, run pre-merge smoke test** in `quickstart.md`. **DoD #16 met.**

### Incremental Delivery

After the MVP ships:

6. Phase 6 (US4 — Search & filter) + Phase 7 (US5 — Delete) can land in parallel — neither blocks the other.
7. Phase 8 (US6 — Auto-save) is the largest non-MVP phase; ship after US4/US5 to keep the auto-save indicator co-located with the now-mature panel UX.
8. Phase 9 (US7 — Team-scoped callable) ships last. Verify storage-rule V1/V2 decision (T058) before promoting to production.
9. Phase 10 (Polish) closes out. T066 is the final deploy step.

### Parallel Team Strategy

With multiple developers post-Phase-2 checkpoint:

- Dev A: US1 then US3 (both touch `<SavedProjectCard>`).
- Dev B: US2 then US6 (both touch the save callable / save flow).
- Dev C: US4 then US5 then US7 (panel-internal feature growth).

US1 must complete `<SavedProjectCard>` (T019) before US5 can mount its delete button (T041) — sync at that point.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[US*]` tasks must reach the end of their phase before the phase checkpoint passes.
- Verify backend tests fail (or don't exist) before implementing — but for already-existing unrelated tests, do **not** touch them.
- Commit after each task or each logical group (e.g., one commit per story phase end).
- Stop at any **Checkpoint** to validate the story independently against `quickstart.md`.
- Avoid: task-level scope creep, vague descriptions, same-file conflicts between [P]-marked tasks, cross-story coupling that breaks story independence.

---

## Format Validation

All 66 tasks above follow the strict checklist format `- [ ] [TaskID] [P?] [Story?] Description with file path`:

- ✅ Every task starts with `- [ ]` and a sequential T-prefixed id (T001 → T066).
- ✅ `[P]` is present only on tasks that can run in parallel (different files, no incomplete dependencies).
- ✅ `[US1]` … `[US7]` labels are present on every story-phase task (Phases 3 → 9). Setup, Foundational, and Polish tasks have no story label — confirmed.
- ✅ Every task names a concrete file path (frontend or backend) or a specific file edit.
- ✅ No task spans multiple stories or multiple files without a clear single primary edit.
