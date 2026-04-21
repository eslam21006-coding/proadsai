# Tasks: Favorites & Workspace

**Input**: Design documents from `/specs/010-favorites-workspace/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested for the original scope — test tasks omitted for T001–T029. Manual testing via quickstart.md. **Phase 10 adds one automated a11y test (T040) required by SC-007.**

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Firestore indexes and project structure for favorites feature

- [X] T001 Add composite Firestore indexes for favorites queries to `firestore.indexes.json`: (1) `generations: (userId, feedback.savedToFavorites, output.phase, timestamp DESC)` and (2) `generations: (workspaceId, feedback.savedToFavorites, output.phase, timestamp DESC)`
- [X] T002 [P] Create `src/hooks/` directory (if not present) to house the new `useFavorites` hook

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Service functions and real-time hook that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement `getFavoriteIds(userId: string, workspaceId?: string): Promise<Set<string>>` in `src/services/feedbackService.ts` — query `generations` collection for docs where `feedback.savedToFavorites == true`, scoped by `userId` or `workspaceId`. Return a `Set<string>` of generation doc IDs. Include fallback for missing composite index (broader query + client-side filter).
- [X] T004 Implement `updateFavoriteRecord(generationId: string, updatedFields: Partial<GenerationRecord['output']>): Promise<void>` in `src/services/feedbackService.ts` — write `updatedFields` nested under `output.*` on the specified Firestore document. Throw on failure.
- [X] T005 Create `src/hooks/useFavorites.ts` — export hook `useFavorites(phase: 'hooks' | 'concepts' | 'render' | 'caption')` that subscribes via Firestore `onSnapshot` filtered by `userId`, `feedback.savedToFavorites == true`, and `output.phase == phase`. When `activeWorkspaceId` is set and user is team member/owner, scope by `workspaceId` instead of `userId`. Return `{ favorites: GenerationRecord[], loading: boolean }`. Include fallback for missing composite index. Unsubscribe on unmount.
- [X] T006 Add `loadedFavoriteId: string | null` and `setLoadedFavoriteId: (id: string | null) => void` to the Zustand store in `src/store.ts` — tracks which favorite was loaded into a step for the post-edit update/keep-both prompt.

**Checkpoint**: Service functions, real-time hook, and store extension ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Persistent Bookmark State (Priority: P1) MVP

**Goal**: Fix the bookmark icon to reflect real saved state from Firestore on page load, eliminating the always-empty initial state bug.

**Independent Test**: Bookmark a generation, refresh the page, verify the filled amber icon appears immediately without re-clicking.

### Implementation for User Story 1

- [X] T007 [US1] Modify `src/components/FeedbackButtons.tsx` to accept a new prop `initialFavorite?: boolean` and use it as the initial value for the `isFavorite` state instead of hardcoded `false`. When `initialFavorite` changes (e.g., after async load), sync the local state via `useEffect`.
- [X] T008 [US1] In `src/App.tsx`, call `getFavoriteIds` (or derive from `useFavorites` data) on page load for the current user/workspace. Store the resulting `Set<string>` in a `useState` or Zustand slice. Pass `initialFavorite={favoriteIds.has(generationId)}` to every `<FeedbackButtons>` instance rendered in Steps 2–5.

**Checkpoint**: Bookmarked items show the correct filled/empty icon on page load — US1 fully functional

---

## Phase 4: User Story 2 — Per-Step Favorites Panel with Load (Priority: P1)

**Goal**: Add a reusable favorites panel to Steps 2–5 that shows saved items per phase with Load and Remove actions.

**Independent Test**: Save a hook, open "Saved Hooks" panel in Step 2, click Load, verify hook text populates the editable fields.

### Implementation for User Story 2

- [X] T009 [US2] Create `src/components/FavoritesPanel.tsx` — implement the panel component per the contract: props `{ phase, onLoad, isOpen, onClose }`. Use `useFavorites(phase)` for data. Render a scrollable sidebar with: sort toggle (newest/oldest/alphabetical, default newest), phase badge per item, preview text (hookText/conceptText/imageUrl thumbnail/captionText), date saved, "Load" button calling `onLoad(record)`, "Remove" button calling `feedbackService.toggleFavorite(id, false)`. Show empty state message when no favorites. Preserve `dir="rtl"` on preview text for Arabic content.
- [X] T010 [US2] Integrate FavoritesPanel into Step 2 (hooks output) in `src/App.tsx` — add a "Saved Hooks" toggle button in the Step 2 header area (~line 4807+). When toggled, render `<FavoritesPanel phase="hooks" onLoad={...} />` as a slide-in panel. The `onLoad` callback populates `tovText`/`selectedTov` (hook text and subhead) into the Zustand store or local state.
- [X] T011 [P] [US2] Integrate FavoritesPanel into Step 3 (concepts output) in `src/App.tsx` — add "Saved Concepts" toggle in Step 3 header (~line 5382+). `onLoad` restores `conceptsText` and `buildPlan` into state.
- [X] T012 [P] [US2] Integrate FavoritesPanel into Step 4 (render output) in `src/App.tsx` — add "Saved Designs" toggle in Step 4 header (~line 5898+). `onLoad` displays the saved `imageUrl` in the result area.
- [X] T013 [P] [US2] Integrate FavoritesPanel into Step 5 (caption output) in `src/App.tsx` — add "Saved Captions" toggle in Step 5 header (~line 6791+). `onLoad` populates `captionText` via `setCaptionText` in the store.
- [X] T014 [US2] Implement auto-save-before-load logic in `src/App.tsx` — in each step's `onLoad` handler, before loading the selected favorite: check if the current step has a non-empty output and a valid `generationId`; if so, call `feedbackService.toggleFavorite(currentGenerationId, true)` to auto-bookmark the current work. Then proceed with loading the favorite's data into step fields. After loading, call `setLoadedFavoriteId(record.id)` to track which favorite was loaded.

**Checkpoint**: All four step panels work independently — users can browse, load, and remove favorites per step. Auto-save protects unsaved work.

---

## Phase 5: User Story 3 — Edit and Save Back to Favorites (Priority: P2)

**Goal**: After loading a favorite and regenerating, prompt user to either overwrite the original or keep both versions.

**Independent Test**: Load a saved favorite, edit and regenerate, verify the "Update or Keep both" prompt appears and both options work.

### Implementation for User Story 3

- [X] T015 [US3] In `src/App.tsx`, after each generation completes (hook/concept/render/caption generation callback), check if `loadedFavoriteId` is not null in the Zustand store. If so, show a centered modal dialog over a dimmed (black/60, backdrop-blur) page backdrop with two buttons: "Yes, update" and "Keep both". Clicking the backdrop cancels the prompt and clears `loadedFavoriteId`. (Matches shipped implementation at `src/App.tsx:7265+`.)
- [X] T016 [US3] Implement "Yes, update" handler — call `feedbackService.updateFavoriteRecord(loadedFavoriteId, newOutputFields)` where `newOutputFields` are the newly generated output fields for the current phase. Then call `setLoadedFavoriteId(null)` to clear tracking.
- [X] T017 [US3] Implement "Keep both" handler — call `feedbackService.toggleFavorite(newGenerationId, true)` to save the new generation as a separate favorite. Then call `setLoadedFavoriteId(null)` to clear tracking.
- [X] T018 [US3] Ensure the update/keep-both prompt does NOT appear when the user generates output without having loaded a favorite (i.e., `loadedFavoriteId === null`).

**Checkpoint**: Full edit-and-save-back loop works — users can iterate on favorites and choose how to save

---

## Phase 6: User Story 4 — Team-Scoped Favorites (Priority: P2)

**Goal**: Team members in the same workspace see and can fully manage each other's favorites.

**Independent Test**: Two team members in the same workspace each save a favorite; both see both favorites in their panels.

### Implementation for User Story 4

- [X] T019 [US4] Verify that `useFavorites` hook (created in T005) correctly switches between user-scoped and workspace-scoped queries based on `activeWorkspaceId` and `isTeamMember`/`isTeamOwner` from `billingState`. If not already implemented, update the query in `src/hooks/useFavorites.ts` to use `where('workspaceId', '==', activeWorkspaceId)` when workspace is active.
- [X] T020 [US4] Verify that `getFavoriteIds` in `src/services/feedbackService.ts` (created in T003) correctly scopes by `workspaceId` when provided. If not, update the query logic.
- [X] T021 [US4] Ensure the FavoritesPanel in `src/components/FavoritesPanel.tsx` allows team members to Load, Remove, and see all workspace favorites regardless of who saved them (full access per clarification Q1). No additional permission checks needed — the query scope handles visibility.

**Checkpoint**: Team members see shared favorites and can load/remove any item in the workspace

---

## Phase 7: User Story 5 — Favorites Count Badge (Priority: P3)

**Goal**: Show a real-time count badge on each step's "Saved [X]" toggle button.

**Independent Test**: Add and remove favorites, verify the badge count updates immediately without page refresh.

### Implementation for User Story 5

- [X] T022 [US5] In `src/App.tsx`, for each step header (Steps 2–5), read `favorites.length` from the `useFavorites(phase)` hook and display it as a badge next to the toggle button text: e.g., "Saved Hooks (3)". Show "(0)" or hide the count when no favorites exist (decide based on existing UI patterns).

**Checkpoint**: Badge counts update in real time across all steps

---

## Phase 8: User Story 6 — Re-generate from Saved Design (Priority: P3)

**Goal**: "Edit & Re-generate" on a saved design restores Step 1 inputs and navigates to Step 3.

**Independent Test**: Load a saved design in Step 4, click "Edit & Re-generate", verify Step 1 inputs are restored and navigation goes to Step 3.

### Implementation for User Story 6

- [X] T023 [US6] In the Step 4 `onLoad` handler in `src/App.tsx`, after displaying the loaded design image, also render an "Edit & Re-generate" button alongside the loaded design.
- [X] T024 [US6] Implement the "Edit & Re-generate" click handler in `src/App.tsx` — read the loaded generation record's `input.*` fields and call `setInputs(record.input)` to restore Step 1 state. Then call `setPhase('concept_review')` (or equivalent) to navigate to Step 3. Clear `loadedFavoriteId` since this starts a fresh generation flow.

**Checkpoint**: Users can iterate on visual designs by jumping back to the blueprint stage with original inputs

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and final quality pass

- [X] T025 [P] Handle deleted-favorite edge case in `src/components/FavoritesPanel.tsx` — when `onLoad` is called but the generation record no longer exists (Firestore read returns null), show a "This saved item is no longer available" message and offer to remove the stale entry.
- [X] T026 [P] Handle schema-mismatch edge case in `src/App.tsx` step `onLoad` handlers — when loading a favorite, if expected output fields are missing (e.g., `hookText` is undefined), load available fields and leave missing fields empty. Show a brief notice to the user.
- [X] T027 Verify `dir="rtl"` is preserved on all text previews in `src/components/FavoritesPanel.tsx` for Arabic content (matches existing pattern in PerformanceDashboard).
- [X] T028 Run `npm run lint` and `npm run build` to verify no TypeScript or lint errors across all modified files.
- [X] T029 Run manual validation per `specs/010-favorites-workspace/quickstart.md` — test all 5 scenarios listed in the Testing section. Additionally: (a) verify that revoking a user's workspace membership causes team favorites from that workspace to no longer appear in their panel (spec edge case #4); (b) measure and record the observed panel-open + first-item-load latency (target: <3 s per SC-002) and cross-tab real-time sync delay (target: ≤2 s per SC-003), using browser DevTools Performance or timestamp logs. Report the observed numbers in the task closeout note.

---

## Phase 10: Clarification-Driven Enhancements (Session 2026-04-21)

**Purpose**: Implement FR-014 (pagination), FR-015 (offline banner), and FR-016 + SC-007 (WCAG 2.1 AA). These are cross-cutting enhancements to the already-shipped favorites surface. No user-story label — each task touches the shared `useFavorites` hook, `FavoritesPanel`, or step headers across all four steps.

**Prerequisites**: T001–T029 complete (US1–US6 shipped). Phase 10 enhances existing behavior; it does not block earlier stories.

### FR-014 — Pagination (100-item soft cap + "Show older")

- [X] T030 Extend `src/hooks/useFavorites.ts` with pagination: add `limit(100)` to the primary Firestore query, expose `hasMore: boolean` (true when the current page returned exactly 100 docs), `lastCursor: DocumentSnapshot | null`, and `loadMore(): Promise<void>` that fetches the next 100 via `getDocs` + `startAfter(lastCursor)` and appends to `favorites`. The first page retains the live `onSnapshot` subscription; subsequent pages are static for the session. `loadMore()` is a no-op when `hasMore === false` or a load is already in flight.
- [X] T031 Update `src/components/FavoritesPanel.tsx` to render a "Show older" button at the tail of the list when `useFavorites().hasMore === true`. Clicking calls `loadMore()`. Set `aria-busy="true"` on the button while loading. After new items append, programmatically move focus to the first newly-added listitem so keyboard users can continue navigation without losing place.

### FR-015 — Offline / snapshot-loss banner

- [X] T032 Extend `src/hooks/useFavorites.ts` to expose `connectionState: 'live' | 'stale'`. In the `onSnapshot` error callback: retain the last successful `favorites`, set `connectionState = 'stale'`, and do NOT unsubscribe (the Firebase SDK auto-retries). On the next successful snapshot: set `connectionState = 'live'`. Do not surface a user-facing error from the hook itself.
- [X] T033 Update `src/components/FavoritesPanel.tsx` to render a non-blocking inline banner above the list when `useFavorites().connectionState === 'stale'` with text "Offline — showing last saved list". Place the banner inside an `aria-live="polite"` region so screen readers announce the state transition. The banner disappears automatically when `connectionState` returns to `'live'` — no manual retry control.

### FR-016 + SC-007 — WCAG 2.1 AA baseline

- [X] T034 [P] Add `aria-expanded={isOpen}` and `aria-controls={panelId}` to each "Saved [X]" toggle button in `src/App.tsx` (Steps 2, 3, 4, 5). Generate a stable, unique `panelId` per step (e.g., `favorites-panel-hooks`).
- [X] T035 [P] Add `role="region"` and `aria-label` (phase-specific: "Saved hooks" / "Saved concepts" / "Saved designs" / "Saved captions") to the panel root container in `src/components/FavoritesPanel.tsx`.
- [X] T036 [P] Wrap the favorites list in `role="list"` and each item in `role="listitem"` within `src/components/FavoritesPanel.tsx`. Render Load and Remove as `<button>` elements with accessible names that include a truncated preview of the item (e.g., `aria-label="Load hook: <first 40 chars>"`, `aria-label="Remove hook: <first 40 chars> from favorites"`).
- [X] T037 Implement focus management in `src/components/FavoritesPanel.tsx`: on `isOpen` transitioning to true, move focus to the first interactive control (sort toggle). Handle `Escape` keypress to call `onClose()` and return focus to the step-header toggle button. Panel is non-modal — no focus trap required. Store the pre-open `activeElement` so focus restoration is reliable.
- [X] T038 [P] Wrap each step's count-badge span in `src/App.tsx` with an `aria-live="polite"` region so screen readers announce count changes (e.g., "Saved Hooks (3)" → "Saved Hooks (4)") without being disruptive.
- [X] T039 [P] Add `axe-core` and `vitest-axe` as dev dependencies: `npm install -D axe-core vitest-axe`. If already present, verify versions are compatible with Vitest 1.x.
- [X] T040 [P] Create `src/components/__tests__/FavoritesPanel.a11y.test.tsx` — render `FavoritesPanel` with a mock `useFavorites` returning four states (empty, 3 items, 100 items with `hasMore: true`, `connectionState: 'stale'` with 3 items). For each state: run `axe.run()` and assert zero `critical` or `serious` violations. This is the automated half of SC-007.
- [ ] T041 Manual keyboard-only validation matching quickstart.md Test 8 — open the panel via Tab + Enter on the toggle, Tab through each listitem, press Enter on Load and Remove, change the sort via keyboard, activate "Show older" via keyboard, close via `Escape`. All without using a pointing device. Record PASS/FAIL per step. This is the manual half of SC-007. Also re-measure panel-open + first-item-load latency (SC-002: <3 s) and real-time sync delay (SC-003: ≤2 s) using the post-Phase-10 implementation (pagination may affect first-page render); report observed numbers alongside the a11y checklist.

**Checkpoint**: FR-014 (pagination), FR-015 (offline banner), and FR-016 / SC-007 (WCAG 2.1 AA) fully implemented and verified. All 16 functional requirements and all 7 success criteria now covered by tasks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 (Phase 4)**: Depends on Foundational (Phase 2). Can run in parallel with US1 but US1 is recommended first (bookmark fix enhances panel UX).
- **US3 (Phase 5)**: Depends on US2 (Phase 4) — needs FavoritesPanel and Load to exist before save-back prompt is meaningful.
- **US4 (Phase 6)**: Depends on Foundational (Phase 2). Can run in parallel with US1–US3 since team scoping is a query-level concern.
- **US5 (Phase 7)**: Depends on US2 (Phase 4) — needs the toggle button and panel to exist for badge placement.
- **US6 (Phase 8)**: Depends on US2 (Phase 4) — needs FavoritesPanel with Load in Step 4.
- **Polish (Phase 9)**: Depends on all user stories being complete.
- **Clarification Enhancements (Phase 10)**: Depends on US2 (Phase 4) and US5 (Phase 7) — extends the shipped `useFavorites` hook, `FavoritesPanel`, and step count badges. Each sub-group (FR-014 / FR-015 / FR-016) can be tackled independently; inside each group, hook changes precede panel/UI changes (e.g., T030 before T031; T032 before T033).

### User Story Dependencies

```text
Phase 2 (Foundational) ──► US1 (bookmark fix)
                        ──► US2 (panels + load) ──► US3 (edit & save back)
                        │                       ──► US5 (count badges)
                        │                       ──► US6 (re-generate from design)
                        └──► US4 (team scoping)
```

### Within Each User Story

- Service/hook code before UI integration
- Core functionality before edge cases
- Commit after each task or logical group

### Parallel Opportunities

- T001 and T002 can run in parallel (Setup phase)
- T003 and T004 can run in parallel (different functions in same file, but sequential is safer)
- T011, T012, T013 can run in parallel (different step sections in App.tsx — different line ranges)
- T025, T026, T027 can run in parallel (different files/concerns)
- US1 and US4 can run in parallel (independent concerns)
- **Phase 10 parallel set**: T034, T035, T036, T038, T039, T040 can all run in parallel (different files or concerns — App.tsx toggle attributes, FavoritesPanel container attributes, list role markup, count-badge live region, dep install, and a11y test file). T030/T031 and T032/T033 form two serial pairs that can themselves run in parallel with the a11y set and with each other. T037 and T041 are single-file / manual tasks that close out the phase.

---

## Parallel Example: User Story 2

```bash
# After T009 (FavoritesPanel) and T010 (Step 2 integration) are complete,
# launch Steps 3, 4, 5 integration in parallel:
Task T011: "Integrate FavoritesPanel into Step 3 in src/App.tsx"
Task T012: "Integrate FavoritesPanel into Step 4 in src/App.tsx"
Task T013: "Integrate FavoritesPanel into Step 5 in src/App.tsx"
```

## Parallel Example: Phase 10 (Clarification Enhancements)

```bash
# Hook-side work (two independent sub-groups, can run concurrently):
Task T030: "Add pagination (limit/hasMore/loadMore) to src/hooks/useFavorites.ts"
Task T032: "Add connectionState tracking to src/hooks/useFavorites.ts"

# After T030, T032 land, six a11y tasks can run fully in parallel:
Task T034: "Add aria-expanded/aria-controls to step toggles in src/App.tsx"
Task T035: "Add role/aria-label to panel container in FavoritesPanel.tsx"
Task T036: "Add role='list' / 'listitem' in FavoritesPanel.tsx"
Task T038: "Wrap count badges with aria-live='polite' in src/App.tsx"
Task T039: "Install axe-core + vitest-axe dev deps"
Task T040: "Write FavoritesPanel.a11y.test.tsx with axe assertions"

# Close out serially:
Task T031: "Render 'Show older' button in FavoritesPanel.tsx"
Task T033: "Render offline banner in FavoritesPanel.tsx"
Task T037: "Implement panel focus management + Escape key"
Task T041: "Manual keyboard-only validation pass"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (indexes + directory)
2. Complete Phase 2: Foundational (service functions + hook + store)
3. Complete Phase 3: US1 — Bookmark state fix
4. Complete Phase 4: US2 — Favorites panels with Load
5. **STOP and VALIDATE**: Test bookmark persistence and panel load independently
6. Deploy/demo if ready — core favorites workflow is complete

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (bookmark fix) → Test → Deploy (immediate UX improvement)
3. Add US2 (panels + load) → Test → Deploy (core feature complete — MVP!)
4. Add US3 (edit & save back) → Test → Deploy (iteration loop closed)
5. Add US4 (team scoping) → Test → Deploy (collaboration enabled)
6. Add US5 + US6 (badges + re-generate) → Test → Deploy (polish)
7. Add Phase 10 (pagination + offline banner + WCAG 2.1 AA) → Test → Deploy (launch-quality polish + scalability)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- All step UI integration happens in `src/App.tsx` since step components are inline (not separate files)
- FavoritesPanel is a single reusable component — created once (T009), integrated four times (T010–T013)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
