# Feature Specification: Frontend Launch Filter, Override Signals & Priority Lane QA

**Feature Branch**: `002-frontend-filter-qa`
**Created**: 2026-03-31
**Status**: Draft
**Input**: Phase 2 from LAUNCH_MATRIX.md — Spec C (Frontend Launch Filter + Override Signals) + Spec D (Priority Lane QA Fixtures)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invalid Combination Blocking (Priority: P1)

As a user selecting creative options in the input form, any combination not approved for launch is immediately blocked with a clear inline message explaining why. I cannot proceed to generation with an invalid combination.

**Why this priority**: Without frontend blocking, users waste time configuring invalid setups only to be rejected by the server. The frontend must enforce the same rules as the backend to prevent confusion and wasted effort.

**Independent Test**: Attempt every non-launch combination (deleted modes, invalid pairs, plan-gated formats) and verify each is blocked with a specific inline reason. Attempt every approved combination and verify none are falsely blocked.

**Acceptance Scenarios**:

1. **Given** a user selects a creative mode that was deleted (limited_access, module_preview, day_strip), **When** the input form renders, **Then** these modes do not appear in the mode selector at all.
2. **Given** a user on a Starter plan selects "carousel" as the ad format, **When** the system evaluates the combination, **Then** the carousel option is disabled or blocked with "Carousel requires Pro plan or higher."
3. **Given** a user selects "before_after" and then attempts to add a second mode, **When** the system evaluates, **Then** the second mode is blocked with "Before/After is a standalone mode and cannot be paired."
4. **Given** a user selects a valid combination, **When** they proceed to generation, **Then** no blocking message appears and generation starts normally.

---

### User Story 2 - Deleted Modes Removed from UI (Priority: P2)

As a user, I cannot see "limited_access", "module_preview", or "day_strip" anywhere in the application. These modes do not appear in any mode selector, card grid, prompt logic, or mode-related UI element.

**Why this priority**: Deleted modes left in the UI confuse users and create the illusion of supported features. Complete removal prevents accidental selection and support requests.

**Independent Test**: Search the entire frontend codebase for references to these three mode names and verify zero matches in any user-facing component, mode catalog, or prompt construction logic.

**Acceptance Scenarios**:

1. **Given** a user browses creative modes for any offer type, **When** they view the mode selector, **Then** "limited_access", "module_preview", and "day_strip" do not appear.
2. **Given** any pairing rule, compatibility map, or prompt template in the frontend, **When** inspected, **Then** no reference to deleted modes exists.

---

### User Story 3 - Before/After Reclassification in UI (Priority: P3)

As a user creating a cold campaign, I find "before_after" in the creative mode grid (not the hook angle selector). The hook angle selector shows exactly 10 angles. Before/After appears as a creative mode available in all 3 offer type tabs.

**Why this priority**: before_after was reclassified from hook angle to creative mode in Spec B (resolver). The frontend must match this reclassification so the UI and backend agree.

**Independent Test**: Verify before_after does not appear in the hook angle dropdown. Verify it appears in the creative mode grid for all 3 tabs. Verify it is enforced as solo-only (cannot be paired).

**Acceptance Scenarios**:

1. **Given** a user opens the hook angle selector, **When** they view options, **Then** "before_after" is not listed — only the 10 approved cold hook angles appear.
2. **Given** a user views creative modes for "Mini-Course", **When** they see the mode grid, **Then** "before_after" appears as a selectable mode.
3. **Given** a user views creative modes for "Live Events" or "Free Guide", **When** they see the grid, **Then** "before_after" appears.

---

### User Story 4 - Offer Type Dropdown Consolidation (Priority: P4)

As a user, the offer type dropdown shows exactly 3 entries: "Live Event", "Free Guide", and "Mini-Course". The old entries "Free Webinar", "Paid Workshop", and "Challenge" no longer appear.

**Why this priority**: The product owner consolidated 5 offer types into 3 for launch clarity. The frontend must reflect this.

**Independent Test**: Open the offer type dropdown and verify exactly 3 entries. Load a saved project with an old offer type name and verify it maps correctly to the new name.

**Acceptance Scenarios**:

1. **Given** a user opens the offer type dropdown, **When** they see the options, **Then** exactly 3 entries appear: "Live Event", "Free Guide", "Mini-Course".
2. **Given** a user loads a saved project that used "Free Webinar", **When** the project loads, **Then** it maps to "Live Event" without error.

---

### User Story 5 - Override Signals (Priority: P5)

As a user, when the system automatically changes my selection (auto-clears, suppressions, overrides), I see a clear notification explaining what changed and why. I am never left wondering why a field disappeared or a value changed.

**Why this priority**: Silent state changes cause confusion and bug reports. Users must understand when and why the system modified their selections.

**Independent Test**: Trigger each override event from the Silent Overrides Registry (LAUNCH_MATRIX Section 7) and verify the correct UI signal appears each time.

**Acceptance Scenarios**:

1. **Given** a user uploads a reference ad, **When** the upload completes, **Then** a banner appears: "Reference ad active — visual style follows the reference."
2. **Given** a user switches campaign type from cold to retargeting, **When** the switch occurs, **Then** the hook angle section is replaced by the objection section (no orphan hook angle state).
3. **Given** a user selects "text_only" mode, **When** the mode activates, **Then** the universe, art direction, and Box A sections collapse/hide.
4. **Given** a user selects "before_after" with carousel format, **When** the system detects the conflict, **Then** an inline message appears: "Before/After is single-image only."
5. **Given** a value_stack carousel's slide count is auto-adjusted, **When** the override fires, **Then** the user sees: "Carousel adjusted to [N] slides — one gift per slide."
6. **Given** a user switches from realistic to minimal style family, **When** the switch occurs, **Then** the art direction grid disappears (no cards available for minimal).
7. **Given** a user switches from realistic to fantasy, **When** the switch occurs, **Then** art direction cards reset to the fantasy card set (non-fantasy cards cleared).

---

### User Story 6 - Non-Launch Languages Hidden (Priority: P6)

As a user, the ad language selector shows only the 7 launch languages (6 Arabic dialects + English). French, Spanish, German, Turkish, and Portuguese do not appear.

**Why this priority**: Non-launch languages have no quality contracts. Showing them invites usage that produces ungoverned output quality.

**Independent Test**: Open the language selector and verify exactly 7 entries. Verify the 5 hidden languages are not reachable through any UI path.

**Acceptance Scenarios**:

1. **Given** a user opens the ad language dropdown, **When** they see options, **Then** exactly 7 languages appear: Arabic Fusha, Egyptian, Gulf, Levantine, Iraqi, Maghrebi, and English.
2. **Given** a saved project with French selected, **When** it loads, **Then** the language defaults to Arabic Fusha (or shows a warning) rather than displaying French.

---

### User Story 7 - Visual Controls Behavior (Priority: P7)

As a user, the visual control fields (style family, universe, art direction, upload boxes) show and hide correctly based on my current selections, following the approved behavior from the launch matrix.

**Why this priority**: Incorrect field visibility creates invalid input states that the backend must silently handle. Correct visibility prevents invalid states from forming.

**Independent Test**: For each style family (realistic, fantasy, minimal) and each special mode (text_only), verify the correct fields are visible/hidden per LAUNCH_MATRIX Section 6.4.

**Acceptance Scenarios**:

1. **Given** a user selects "minimal" family, **When** the UI updates, **Then** the universe dropdown remains visible but art direction cards are hidden.
2. **Given** a user selects "text_only" mode, **When** the UI updates, **Then** universe, art direction, style family, and Box A are hidden.
3. **Given** a user selects "realistic" family, **When** they view art direction, **Then** 10 realistic art direction cards appear (Creator+ to unlock).
4. **Given** a user selects "fantasy" family, **When** they view art direction, **Then** 10 fantasy art direction cards appear.
5. **Given** the art direction section, **When** rendered, **Then** the label reads "Art Direction" regardless of which family is selected.
6. **Given** a user is on a Pro+ plan and uploads a reference ad, **When** the upload completes, **Then** a banner appears indicating the reference ad overrides visual style.
7. **Given** a user on Starter or Creator plan, **When** they view the reference ad upload area, **Then** it is hidden or disabled (Pro+ only).

---

### User Story 8 - Priority Lane QA Fixtures (Priority: P8)

As a QA reviewer, I have a set of canonical test fixtures — one per priority lane (11 total) — each with exact input data, expected resolver output, and pass/fail checks. I can run these fixtures to verify each launch lane works correctly end-to-end.

**Why this priority**: Without canonical fixtures, QA is subjective. Fixtures provide deterministic, repeatable validation for every launch lane.

**Independent Test**: Run all 11 fixtures and verify each produces the expected resolution trace and passes all lane-specific checks.

**Acceptance Scenarios**:

1. **Given** the Lane 1 fixture (Retargeting + Carousel), **When** executed, **Then** slide 1 names the objection, middle slides have no CTA, visual style is consistent, and the resolution trace matches expected values.
2. **Given** the Lane 2 fixture (Cold + Single + before_after), **When** executed, **Then** the canvas has a before/after split, no text labels, same hero both halves, and CTA at bottom center.
3. **Given** the Lane 3 fixture (Cold + Carousel + value_stack), **When** executed, **Then** slide count matches gift count + 2, no CTA on gift slides, and empty fields are absent.
4. **Given** any of the 11 lane fixtures, **When** the fixture input is submitted, **Then** the resolution trace `launchMatrixCheckPassed` is `true` and per-slide structure matches the lane's behavior contract.

---

### User Story 9 - Evidence Workflow for Fixes (Priority: P9)

As a developer closing an issue, I must provide a complete evidence pack before the issue can be marked as resolved. The evidence pack includes the failing rule, controlling code location, root cause, the fix, before/after resolution traces, before/after screenshots, and exact reproducible test inputs.

**Why this priority**: Without mandatory evidence, fixes are accepted based on "it looks fine" — violating Constitution Principle IX. The evidence workflow ensures every fix is provable.

**Independent Test**: Attempt to close an issue without a complete evidence pack and verify the process rejects it. Submit a complete evidence pack and verify the process accepts it.

**Acceptance Scenarios**:

1. **Given** a developer claims a fix for a Lane 1 issue, **When** the evidence is reviewed, **Then** it must contain: failing rule ID, controlling file/function, why the old behavior occurred, what changed, resolution trace before, resolution trace after, screenshot before, screenshot after, and exact test inputs.
2. **Given** an incomplete evidence pack, **When** a reviewer checks it, **Then** the specific missing items are identified and the issue cannot be closed.

---

### Edge Cases

- What happens when a user loads a saved project created before the UI changes (old offer types, deleted modes, hidden languages)? The system maps old values to new equivalents or shows a warning.
- What happens when a user on a free/none plan accesses the app? Only Starter-level options are visible; all plan-gated features are hidden or disabled.
- What happens when multiple override signals fire simultaneously (e.g., switch to retargeting + text_only at the same time)? Each signal fires independently and the UI reflects all changes.
- What happens when the frontend and backend launch surface validations disagree? The backend rejection is authoritative; the frontend should have caught it first, so this indicates a frontend bug.
- What happens when a fixture test fails? The exact failure point, expected vs actual values, and the relevant resolution trace fields are reported.
- What happens when a user switches offer type after selecting modes not valid for the new type? Invalid modes are auto-cleared with an inline notification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST consume the shared `validateLaunchSurface()` function to block invalid combinations with an inline message below the blocked control — generation MUST NOT proceed.
- **FR-002**: The frontend MUST completely remove "limited_access", "module_preview", and "day_strip" from all mode catalogs, mode selectors, pairing rules, compatibility maps, and prompt logic.
- **FR-003**: The frontend MUST display "before_after" in the creative mode grid (available in all 3 tabs) and remove it from the hook angle selector. The hook angle selector MUST show exactly 10 angles.
- **FR-004**: The frontend MUST show exactly 3 offer type entries: "Live Event", "Free Guide", "Mini-Course". Old names MUST map silently when loading saved projects.
- **FR-005**: The frontend MUST display a UI signal for every override event defined in LAUNCH_MATRIX Section 7 (9 user-facing events). Each signal MUST appear at the moment the override fires and be visible without scrolling to the affected area.
- **FR-006**: The ad language selector MUST show exactly 7 launch languages. The 5 non-launch languages (French, Spanish, German, Turkish, Portuguese) MUST be removed from the selector entirely.
- **FR-007**: The universe dropdown MUST remain visible when "minimal" family is selected. Art direction cards MUST be hidden for minimal and text_only.
- **FR-008**: The art direction section MUST be labeled "Art Direction" across all families. Realistic and Fantasy MUST each show their own set of 10 cards.
- **FR-009**: The reference ad upload MUST be gated to Pro plan and above. When active, a banner MUST indicate it overrides visual style.
- **FR-010**: The slide count display MUST auto-update when value_stack or testimonial carousel overrides the user's selection, with an inline notification showing the new count and reason.
- **FR-011**: A canonical QA fixture MUST exist for each of the 11 priority lanes, containing: exact input data, expected resolution trace values, and pass/fail checks derived from the lane's behavior contract.
- **FR-012**: Every claimed fix MUST include a complete evidence pack (9 items per LAUNCH_MATRIX Section 10) before the issue can be closed. Incomplete evidence packs MUST be flagged with specific missing items.

### Key Entities

- **Launch Surface Filter**: A frontend enforcement layer that consumes the shared `validateLaunchSurface()` function and translates its results into inline blocking messages on the input form.
- **Override Signal**: A user-facing notification (banner, toast, or inline message) that fires when the system automatically changes a user's selection. Each signal has a defined trigger event, message text, and affected UI area.
- **QA Fixture**: A canonical test case for a priority lane containing exact input JSON, expected resolution trace, and pass/fail checks. 11 fixtures total, one per lane.
- **Evidence Pack**: A structured proof-of-fix document containing 9 required items: failing rule ID, controlling file/function, root cause explanation, the change made, before/after resolution traces, before/after screenshots, and exact reproducible test inputs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of non-launch combinations are blocked by the frontend before the user can trigger generation — zero invalid requests reach the server from the UI.
- **SC-002**: Zero references to "limited_access", "module_preview", or "day_strip" exist in any frontend file (mode catalogs, selectors, prompt logic, constants).
- **SC-003**: "before_after" appears in the creative mode grid for all 3 tabs and does not appear in the hook angle selector.
- **SC-004**: The offer type dropdown shows exactly 3 entries. Saved projects with old offer type names load without error.
- **SC-005**: Every override event from LAUNCH_MATRIX Section 7 produces a visible UI signal when triggered — 9 out of 9 events have working signals.
- **SC-006**: The ad language selector shows exactly 7 options. Zero non-launch languages are reachable.
- **SC-007**: All 11 priority lane QA fixtures pass when run against the current codebase.
- **SC-008**: The evidence workflow is documented and enforced — no issue can be closed without all 9 evidence items present.

## Assumptions

- Spec B (001-resolver-completeness-trace) is complete and deployed before this spec begins. The shared `validateLaunchSurface()` function, carousel slide plans, value stack auto-adjustment, and resolution trace are all available for the frontend to consume.
- The backend server-side guard (T016 from Spec B) is already in place as defense-in-depth. This spec focuses on the frontend enforcement layer.
- Override signal UI patterns (banners, toasts, inline messages) follow the existing toast notification system in the app. No new notification infrastructure is needed.
- The 11 priority lane behavior contracts are fully defined in LAUNCH_MATRIX Section 5. Fixtures encode those contracts as executable tests.
- The evidence workflow is a process/documentation standard, not a software feature. It is enforced via code review practice, not automated tooling.
- Saved projects from before the UI changes may reference old offer types, deleted modes, or hidden languages. These are handled via silent mapping to valid equivalents, not by breaking the load.
- The mode grid, hook angle selector, and language selector are all in `src/components/InputForm.tsx` or consume data from `src/constants.ts` and `src/creativeResolver.ts`.
- Art direction cards are defined in `src/artDirectionConfig.ts` and filtered by the currently selected style family.
