# Feature Specification: Frontend Enforcement

**Feature Branch**: `002-frontend-filter-qa`
**Created**: 2026-04-02
**Status**: Draft
**Input**: Phase 2 from LAUNCH_MATRIX.md Section 14 — Frontend Enforcement (12 tasks: 2.1–2.12)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deleted Modes Removed from UI (Priority: P1)

As a user, I cannot see "limited_access", "module_preview", or "day_strip" anywhere in the application — no mode cards, no selectors, no field sections. These modes are gone from the frontend.

**Why this priority**: Deleted modes still visible in the UI create confusion and allow selection of modes the backend rejects. This is the first cleanup step.

**Independent Test**: Browse all offer type tabs and verify zero presence of deleted modes in mode selectors, constants, and conflict maps.

**Acceptance Scenarios**:

1. **Given** a user views creative mode options for any offer type, **When** they see the mode selector, **Then** "limited_access", "module_preview", and "day_strip" do not appear.
2. **Given** any mode-related constant or conflict map in the frontend, **When** inspected, **Then** no reference to deleted modes exists.

---

### User Story 2 - Before/After Reclassification in UI (Priority: P2)

As a user creating a cold campaign, I find "before_after" in the creative mode card grid — not the hook angle selector. The hook angle selector shows exactly 10 angles.

**Why this priority**: before_after was reclassified from hook angle to creative mode in Phase 1 (backend). The frontend must match.

**Independent Test**: Verify before_after is absent from hook angle options and present in the creative mode grid for all 3 tabs.

**Acceptance Scenarios**:

1. **Given** a user opens the hook angle selector, **When** they view options, **Then** "before_after" is not listed.
2. **Given** a user views creative modes for any tab, **When** they see the grid, **Then** "before_after" appears as a selectable creative mode.

---

### User Story 3 - Non-Launch Languages Hidden (Priority: P3)

As a user, the ad language selector shows only the 7 launch languages. French, Spanish, German, Turkish, and Portuguese do not appear.

**Why this priority**: Non-launch languages have no quality contracts. Showing them invites ungoverned output.

**Independent Test**: Open the language selector and count — exactly 7 entries.

**Acceptance Scenarios**:

1. **Given** a user opens the ad language dropdown, **When** they see options, **Then** exactly 7 languages appear: Arabic Fusha, Egyptian, Gulf, Levantine, Iraqi, Maghrebi, and English.

---

### User Story 4 - Launch Surface Validation in UI (Priority: P4)

As a user, when I select an invalid combination (e.g., before_after + carousel, or a deleted mode somehow), an inline message appears below the blocked element explaining why. Generation is blocked until I fix the combination.

**Why this priority**: Without frontend validation, invalid combos reach the server and waste a round-trip before being rejected.

**Independent Test**: Select various invalid combinations and verify each shows an inline blocking message. Select valid combinations and verify no blocking message appears.

**Acceptance Scenarios**:

1. **Given** a user selects "before_after" and then tries to select carousel format, **When** the system validates, **Then** an inline message appears: "Before/After is single-image only."
2. **Given** a user selects a valid combination, **When** they proceed, **Then** no blocking message appears and generation starts.

---

### User Story 5 - Visual Controls Behavior (Priority: P5)

As a user, the visual control fields (style family, universe dropdown, art direction) behave correctly: the universe dropdown stays visible for all 3 families including Minimal, the art direction section is labeled "Art Direction" for all families, and Fantasy has its own card set.

**Why this priority**: Incorrect visibility creates invalid states that the backend must handle.

**Independent Test**: For each family (realistic, fantasy, minimal), verify universe dropdown visibility and art direction card filtering.

**Acceptance Scenarios**:

1. **Given** a user selects "minimal" family, **When** the UI updates, **Then** the universe dropdown remains visible.
2. **Given** a user selects "realistic" or "fantasy", **When** they view art direction, **Then** cards filter to that family's set.
3. **Given** the art direction section, **When** rendered, **Then** the label reads "Art Direction" regardless of family.

---

### User Story 6 - Reference Ad Plan Gate (Priority: P6)

As a user on Starter or Creator plan, I cannot see or access the reference ad upload. It is only available for Pro plan and above.

**Why this priority**: Reference ad is a Pro+ feature. Showing it to lower-tier users creates confusion.

**Acceptance Scenarios**:

1. **Given** a user on Starter plan, **When** they view the input form, **Then** the reference ad upload field is hidden.
2. **Given** a user on Pro plan, **When** they view the input form, **Then** the reference ad upload field is visible.

---

### User Story 7 - Slide Count Auto-Override (Priority: P7)

As a user creating a value_stack carousel, the slide count auto-adjusts to gift count + 2 (capped at plan max). I see an inline message: "Carousel adjusted to N slides — one gift per slide." The same pattern applies when testimonial mode is active (testimonial count + 2).

**Why this priority**: Manual slide count management is error-prone. Auto-adjustment prevents empty or duplicate slides.

**Acceptance Scenarios**:

1. **Given** a user selects value_stack + carousel with 4 gifts, **When** the slide count resolves, **Then** it is set to 6 with the inline message.
2. **Given** testimonial mode with 3 screenshots, **When** the slide count resolves, **Then** it is set to 5 with the inline message.

---

### User Story 8 - Override Signals (Priority: P8)

As a user, when the system auto-changes my selection, I see a notification. These include: retargeting clearing hook angle, text_only collapsing visual section, before_after + carousel being blocked, testimonial auto-switching to carousel, and family switch clearing art direction.

**Why this priority**: Silent changes confuse users and generate bug reports.

**Acceptance Scenarios**:

1. **Given** a user switches to retargeting, **When** the switch occurs, **Then** the hook angle section is replaced by the objection section.
2. **Given** a user selects text_only, **When** the mode activates, **Then** visual controls collapse.
3. **Given** a user switches style family, **When** the switch occurs, **Then** art direction resets and an inline signal appears.

---

### Edge Cases

- What happens when a saved project references a deleted mode? The system resets modes to `['standard_hero']` and shows a compatibility toast.
- What happens when a saved project has a non-launch language? Falls back to `ar_fusha` with a toast.
- What happens when a saved project has an old offer type (e.g., "Free Webinar")? Maps to "Live Event" silently via `getTabForOfferType()` fallback.
- What happens when multiple override signals fire simultaneously? Each fires independently; all changes reflect in the UI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST remove "limited_access", "module_preview", and "day_strip" from all mode cards, mode selectors, and mode field sections in the input form.
- **FR-002**: The frontend MUST remove these 3 modes from all mode-related constants and conflict maps.
- **FR-003**: The frontend MUST move "before_after" from the hook angle selector to the creative mode card grid, available in all 3 offer type tabs.
- **FR-004**: The frontend MUST remove "before_after" from the cold hook angle list, leaving exactly 10 angles.
- **FR-005**: The frontend MUST filter the language selector to show only 7 launch languages — remove fr, es, de, tr, pt.
- **FR-006**: The frontend MUST call `validateLaunchSurface()` on every mode/format/campaign selection change and display an inline blocking message when `allowed: false`.
- **FR-007**: The universe dropdown MUST remain visible for all 3 style families including Minimal.
- **FR-008**: The art direction section MUST be labeled "Art Direction" across all families. Fantasy and Realistic MUST each show their own card sets.
- **FR-009**: The reference ad upload field MUST be hidden for Starter and Creator plans (Pro+ only).
- **FR-010**: When value_stack is active in carousel mode, the slide count MUST auto-adjust to gift count + 2 (capped at plan max) with an inline notification.
- **FR-011**: When testimonial mode is selected in carousel mode, the slide count MUST auto-adjust to testimonial count + 2 with an inline notification.
- **FR-012**: The frontend MUST display signals for all auto-switch events: retargeting clears hook angle, text_only collapses visual section, before_after + carousel blocked, testimonial auto-switches to carousel, family switch clears art direction.

### Key Entities

- **Launch Surface Filter**: Frontend enforcement layer consuming the shared `validateLaunchSurface()` and displaying inline blocking messages.
- **Override Signal**: A user-facing notification (inline text, section swap, or toast) that fires when the system auto-changes a selection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero references to deleted modes in any frontend file used for mode selection, constants, or conflict maps.
- **SC-002**: "before_after" appears only in the creative mode grid, never in the hook angle selector.
- **SC-003**: The language selector shows exactly 7 options.
- **SC-004**: 100% of invalid combinations are blocked with an inline message before the user can trigger generation.
- **SC-005**: Universe dropdown visible for all 3 families. Art direction labeled correctly.
- **SC-006**: Reference ad upload hidden on Starter and Creator plans.
- **SC-007**: Slide count auto-adjusts for value_stack and testimonial carousel with inline notification.
- **SC-008**: All override signals fire at the correct trigger moments.

## Assumptions

- Phase 1 (Resolver Foundation) is complete. `validateLaunchSurface()`, `resolveValueStackSlideCount()`, `carouselSlideCountPlan()`, and `filterEmptyValueStackFields()` are available in the backend resolver.
- The frontend `src/creativeResolver.ts` mirrors the backend resolver. Changes to the frontend resolver are part of this spec.
- The existing toast notification system (`showToast`) is used for transient signals. Inline messages use conditional JSX rendering.
- Saved projects with old data (deleted modes, old offer types, hidden languages) are handled with silent mapping and compatibility toasts.
- Testimonial mode upload UI is a stub in this phase — full implementation is Phase 4 (Testimonial Carousel).
- `src/types.ts` needs to be updated to remove deleted modes from the `OfferCreativeMode` type union and `before_after` from `ColdHookAngle` type.
