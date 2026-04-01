# Tasks: Frontend Launch Filter, Override Signals & Priority Lane QA

**Input**: Design documents from `/specs/002-frontend-filter-qa/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: QA fixtures are part of US8 (not a separate test phase). No frontend test framework exists.

**Organization**: Tasks grouped by user story. US2 (Deleted Modes) and US3 (before_after reclassification) absorbed into Phase 2 as prerequisites. US4 (Offer Types) also absorbed into Phase 2 since it's a data change, not a UI behavior.

**Dependency**: Spec B (001-resolver-completeness-trace) MUST be complete before this spec begins. The shared `validateLaunchSurface()`, resolver types, and backend guard must exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `src/` (React, TypeScript 5.9, bundler moduleResolution)
- **Backend (fixtures only)**: `functions/src/` (TypeScript 5.7, NodeNext)

---

## Phase 1: Foundational (Frontend Resolver Sync + Data Cleanup)

**Purpose**: Mirror Spec B resolver changes in frontend, clean up deleted modes, reclassify before_after, consolidate offer types, filter languages. MUST complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 [P] Mirror Spec B mode deletions in `src/creativeResolver.ts` — delete `limited_access`, `module_preview`, `day_strip` from `CREATIVE_MODE_CATALOG`. Delete all `ALLOWED_PAIRS` entries referencing them. Delete `SUBSTYLE_MODE_COMPAT` entries for them. Delete `DISALLOWED_PAIRS` entries referencing them.
- [X] T002 [P] Add `before_after` to `CREATIVE_MODE_CATALOG` in `src/creativeResolver.ts` — mirror the entry added in Spec B (backend): `tabs: ['mini_course', 'live_events', 'free_guide']`, `role: 'anchor'`, `standaloneAllowed: true`, `soloOnly: true`. Add `soloOnly: boolean` field to the `CreativeModeMeta` interface. Set `soloOnly: true` for `text_only` and `before_after`, `false` for all others.
- [X] T003 [P] Remove `before_after` key from `HOOK_ANGLE_CREATIVE_CONFLICTS` in `src/creativeResolver.ts` — it is no longer a hook angle, it's a creative mode.
- [X] T004 [P] Add solo-only enforcement to `validateCombination()` in `src/creativeResolver.ts` — after mode existence check, if any selected mode has `soloOnly: true` AND `selectedModes.length > 1`, return error: "{mode label} is a standalone mode and cannot be paired."
- [X] T005 [P] Update `getTabForOfferType()` in `src/creativeResolver.ts` — add `'Live Event': 'live_events'` mapping. Keep old names as fallback.
- [X] T006 [P] Update `OFFER_TYPES` in `src/constants.ts` — reduce to `["Live Event", "Free Guide", "Mini-Course"]`. Update `OFFER_CATEGORY_MAP` to add `'Live Event': 'live_events'` (keep old keys as fallback for saved projects).
- [X] T007 [P] Remove `before_after` from `COLD_HOOK_ANGLES` array in `src/constants.ts` — resulting list: 10 approved cold hook angles. Adjust tiering: Starter [0..3] = emotional, pain, curiosity, logic. Creator [0..7] = +social_proof, urgency, statistics, scarcity. Pro+ [0..9] = +logical_authority, future_based.
- [X] T008 [P] Filter `AD_LANGUAGES` in `src/constants.ts` — remove entries for `fr`, `es`, `de`, `tr`, `pt`. Resulting list: 7 languages (ar_fusha, ar_egyptian, ar_gulf, ar_levantine, ar_iraqi, ar_maghreb, en).
- [X] T009 Add i18n keys for override signals in `src/i18n.tsx` — add bilingual translation entries for: `override.reference_ad_active`, `override.testimonial_requires_carousel`, `override.before_after_single_only`, `override.carousel_adjusted_slides`, `override.carousel_adjusted_testimonials`. Use exact text from contracts/override-signals.md.

**Checkpoint**: Run `npm run build`. Verify clean compile. Verify `before_after` is in mode catalog, not in hook angles. Verify 3 deleted modes gone from frontend. Verify 7 languages in selector. Verify 3 offer types.

---

## Phase 2: US1 — Invalid Combination Blocking (P1)

**Goal**: Frontend blocks invalid combinations with inline messages before the user can trigger generation.

**Independent Test**: Select every approved combination → all pass. Select every invalid combination → inline message appears and generation is blocked.

- [X] T010 [US1] Import `validateLaunchSurface` from `src/creativeResolver.ts` into `src/components/InputForm.tsx`. Call it on every relevant input change (mode selection, campaign type toggle, format selection, offer type change). Store the result in local state: `{ allowed: boolean, reason?: string }`.
- [X] T011 [US1] Render inline blocking message in `src/components/InputForm.tsx` — when `validateLaunchSurface` returns `allowed: false`, display `reason` as a red inline message below the affected control (mode selector, format selector, or campaign toggle). Disable the "Generate" button. Message must be bilingual (use `appLang` conditional or i18n key).
- [X] T012 [US1] Handle saved project backward compatibility in `src/components/InputForm.tsx` — when loading a saved project, run `validateLaunchSurface` on loaded inputs. If invalid (e.g., deleted modes, old offer types), auto-fix: reset modes to `['standard_hero']`, map old offer types via `getTabForOfferType()`, fall back hidden languages to `ar_fusha`. Show toast: "Some settings were adjusted for compatibility."

**Checkpoint**: Run `npm run build`. Attempt to select `limited_access` — should not appear. Select `before_after` + `standard_hero` — should block with "Before/After is a standalone mode."

---

## Phase 3: US5 — Override Signals (P5)

**Goal**: Users see clear notifications when the system auto-changes their selections.

**Independent Test**: Trigger each of the 9 override events and verify the correct UI signal appears.

- [X] T013 [US5] Add reference ad override banner in `src/components/InputForm.tsx` — when `inputs.referenceAd` is truthy AND user plan is Pro+, render a persistent colored banner above the visual controls section: "Reference ad active — visual style follows the reference." / Arabic equivalent. Banner dismisses when reference ad is removed.
- [X] T014 [US5] Add stub for testimonial + single format conflict in `src/components/InputForm.tsx` — add a commented-out conditional block: `// Spec G: when testimonial screenshots are uploaded AND adMode === 'single', auto-switch to carousel and call showToast(t('override.testimonial_requires_carousel'), 'info')`. The testimonial upload UI does not exist yet (Spec G), so this cannot fire or be tested. Place the stub near the other override signal logic so Spec G can wire it in.
- [X] T015 [US5] Add inline notification for value_stack slide count override in `src/components/InputForm.tsx` — when value_stack is active in carousel mode AND the resolved slide count differs from user selection, display inline text below the slide count selector: "Carousel adjusted to N slides — one gift per slide." Use the `resolveValueStackSlideCount()` function from `src/creativeResolver.ts` (mirrored from Spec B).
- [X] T016 [US5] Ensure existing section-swap overrides show correctly in `src/components/InputForm.tsx` — verify: (a) retargeting toggle swaps hook section → objection section (already works at line ~1065), (b) text_only selection hides universe + art direction + Box A (partially at line ~311), (c) minimal family hides art direction cards (handled by `getCardsForFamily()`), (d) fantasy switch resets art direction to fantasy cards. Fix any gaps.

**Checkpoint**: Upload a reference ad → banner appears. Switch to retargeting → hook section swaps. Select text_only → visual sections collapse. Select value_stack carousel with 4 gifts → "Adjusted to 6 slides" appears.

---

## Phase 4: US6 — Non-Launch Languages Hidden (P6)

**Goal**: Language selector shows exactly 7 launch languages.

**Independent Test**: Open language dropdown, count entries, verify exactly 7.

- [X] T017 [US6] Verify `AD_LANGUAGES` filtering in `src/components/InputForm.tsx` — confirm the language picker (lines ~1296-1337) renders from `AD_LANGUAGES` and that T008's filtering is reflected. Verify no hardcoded language entries bypass the constant. If the picker has separate "Arabic dialects" and "Other" groups, verify the "Other" group shows only English.
- [X] T018 [US6] Handle saved projects with hidden languages in `src/components/InputForm.tsx` — when loading a project with `adLanguage` set to `fr`, `es`, `de`, `tr`, or `pt`, fall back to `ar_fusha` and show toast: "Language adjusted — original language not available at launch."

**Checkpoint**: Open language selector — exactly 7 entries. Load a project with French — falls back to Arabic Fusha with toast.

---

## Phase 5: US7 — Visual Controls Behavior (P7)

**Goal**: Style family, universe, art direction, and upload boxes show/hide correctly per launch rules.

**Independent Test**: For each family (realistic/fantasy/minimal) and text_only, verify correct field visibility.

- [X] T019 [US7] Ensure art direction section label is "Art Direction" in `src/components/InputForm.tsx` — verify the section heading uses a single label (not per-family labels). If it currently says "Sub-Style" or varies by family, update to consistent "Art Direction" / "اتجاه فني" label.
- [X] T020 [US7] Verify minimal family hides art direction but keeps universe visible in `src/components/InputForm.tsx` — when `visualStyleFamily === 'minimal'`, art direction card grid must not render (no cards available). Universe dropdown must remain visible and interactive. If current code hides universe for minimal, fix it.
- [X] T021 [US7] Gate reference ad upload to Pro+ plan in `src/components/InputForm.tsx` — verify the reference ad upload area is hidden or disabled for Starter and Creator plans. Use `canUse(userPlan, 'referenceAdUpload')` or equivalent plan check. If not currently gated, add the gate.
- [X] T022 [US7] Verify text_only mode suppresses all visual controls in `src/components/InputForm.tsx` — when text_only is active, universe dropdown, art direction cards, style family selector, and Box A (personal photos) must all be hidden. Check `isTextOnlyActive` (line ~311) covers all these. Add any missing suppression.

**Checkpoint**: Select minimal → art direction hidden, universe visible. Select text_only → all visual controls hidden. Reference ad upload hidden on Starter plan.

---

## Phase 6: US8 — Priority Lane QA Fixtures (P8)

**Goal**: 11 canonical test fixtures, one per priority lane, with exact inputs and pass/fail checks.

**Independent Test**: Run `cd functions && npm run test:contracts` — all 11 fixtures pass.

- [X] T023 [P] [US8] Write Lane 1 fixture (Retargeting + Carousel) in `functions/src/contractFixtures.test.ts` — exact input per contracts/qa-fixtures.md Lane 1. Assert: launchMatrixCheckPassed, perSlide CTA placement, retargeting angles distinct, hookAngle null.
- [X] T024 [P] [US8] Write Lane 2 fixture (Cold + Single + before_after) in `functions/src/contractFixtures.test.ts` — assert: before_after as creative mode (not hook angle), single format, launchMatrixCheckPassed.
- [X] T025 [P] [US8] Write Lane 3 fixture (Cold + Carousel + value_stack) in `functions/src/contractFixtures.test.ts` — assert: slideCountOverride, resolvedSlideCount = gifts + 2, per-slide structure, empty fields skipped.
- [X] T026 [P] [US8] Write Lane 4 fixture (Cold + Carousel, any mode) in `functions/src/contractFixtures.test.ts` — assert: cold slide-count plan angles, CTA on slide 1 and last only.
- [X] T027 [P] [US8] Write Lane 5 fixture (Cold + Batch + standard_hero + value_stack) in `functions/src/contractFixtures.test.ts` — assert: both modes in resolvedCreativeModes, batch format approved.
- [X] T028 [P] [US8] Write Lanes 6-7 fixtures (Cold + Single + value_stack, Retargeting + Single + value_stack) in `functions/src/contractFixtures.test.ts` — assert: empty field suppression, objection handling for Lane 7.
- [X] T029 [P] [US8] Write Lanes 8-9 fixtures (Minimal + hero + Single, Minimal + hero + Batch) in `functions/src/contractFixtures.test.ts` — assert: resolvedStyleFamily = 'minimal', artDirectionCleared.
- [X] T030 [P] [US8] Write Lanes 10-11 stub fixtures (Testimonial Carousel Cold + Retargeting) in `functions/src/contractFixtures.test.ts` — stub functions that log "Spec G required" and pass. These will be implemented when testimonial carousel is built.

**Checkpoint**: Run `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all fixtures pass (including 2 stubs).

---

## Phase 7: US9 — Evidence Workflow Documentation (P9)

**Goal**: Evidence workflow template documented and accessible.

- [X] T031 [US9] Create evidence workflow template at `docs/evidence-template.md` — 9-item checklist per contracts/qa-fixtures.md Evidence Workflow Template. Include: failing rule ID, controlling file/function, root cause, what changed, trace before/after, screenshot before/after, exact test inputs. Add instructions for how to use it when closing issues.

**Checkpoint**: Template file exists with all 9 items and clear instructions.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, build check, grep for stale references.

- [X] T032 Run `npm run build` (frontend) — verify clean compile with all changes
- [X] T033 Run `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — verify all existing + new fixtures pass
- [X] T034 Grep `src/` for remaining references to `limited_access`, `module_preview`, `day_strip` — verify zero matches. Also grep for `before_after` in hook angle arrays — verify it only appears in `CREATIVE_MODE_CATALOG`.
- [X] T035 Grep `src/constants.ts` for `fr`, `es`, `de`, `tr`, `pt` in `AD_LANGUAGES` — verify zero matches (languages hidden).
- [X] T036 Verify offer type dropdown renders exactly 3 entries by reading `src/constants.ts` `OFFER_TYPES` — must be `["Live Event", "Free Guide", "Mini-Course"]`.

---

## Dependencies

```text
Phase 1 (Foundational)
  ├── Phase 2: US1 (Launch Surface Blocking) — depends on Phase 1
  │     └── T011 depends on T010
  │     └── T012 depends on T010
  ├── Phase 3: US5 (Override Signals) — depends on Phase 1
  │     └── Independent tasks within
  ├── Phase 4: US6 (Languages Hidden) — depends on T008
  ├── Phase 5: US7 (Visual Controls) — depends on Phase 1
  ├── Phase 6: US8 (QA Fixtures) — independent of frontend (functions/ only)
  │     └── All T023-T030 can run in parallel
  └── Phase 7: US9 (Evidence Workflow) — independent
  └── Phase 8 (Polish) — depends on all phases complete
```

---

## Parallel Opportunities

### Phase 1: Foundational (different files or non-overlapping sections)

```text
# Parallel batch 1 (different files):
T001-T005: src/creativeResolver.ts (same file but non-overlapping sections)
T006-T008: src/constants.ts (same file but different arrays)
T009: src/i18n.tsx (different file)
```

### After Phase 1: User Stories (all independent)

```text
# These can all run in parallel after Phase 1:
T010-T012: US1 — Launch surface blocking (InputForm.tsx)
T013-T016: US5 — Override signals (InputForm.tsx — overlaps with US1, run sequentially)
T017-T018: US6 — Language filtering (InputForm.tsx — can interleave)
T019-T022: US7 — Visual controls (InputForm.tsx — can interleave)
T023-T030: US8 — QA fixtures (functions/ — fully independent of frontend)
T031:      US9 — Evidence template (docs/ — fully independent)
```

### Fully Independent Tracks

```text
Track A (Frontend): T001-T022 (sequential within InputForm.tsx)
Track B (Fixtures): T023-T030 (all parallel, functions/ only)
Track C (Docs):     T031 (independent)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Foundational (resolver sync + data cleanup)
2. Complete Phase 2: US1 (launch surface blocking)
3. **STOP and VALIDATE**: Run `npm run build`. Try invalid combos — all blocked.
4. This delivers immediate value: frontend matches backend, no more invalid combinations.

### Incremental Delivery

1. Foundational → Modes cleaned, offer types consolidated, languages filtered
2. Add US1 → Invalid combinations blocked in UI → Deploy/Demo (MVP!)
3. Add US5 → Override signals visible → Deploy/Demo
4. Add US6 → Language selector cleaned → Deploy/Demo
5. Add US7 → Visual controls correct → Deploy/Demo
6. Add US8 → QA fixtures pass → Verification milestone
7. Add US9 → Evidence workflow documented → Deploy/Demo (Spec C+D complete)
8. Polish → Build clean, grep clean, all tests pass

### Parallel Strategy

Run Track B (QA fixtures) in parallel with Track A (frontend) from the start, since fixtures only touch `functions/src/` and are independent of frontend changes.

---

## Notes

- [P] tasks target different files or non-overlapping sections — safe to parallelize
- US2 (Deleted Modes), US3 (before_after reclassification), US4 (Offer Types) absorbed into Phase 1
- US8 (QA Fixtures) is in `functions/src/` — fully independent of frontend track
- US9 (Evidence Workflow) is a docs task — fully independent
- Most frontend tasks touch `src/components/InputForm.tsx` — run sequentially within that file
- `src/creativeResolver.ts` changes must mirror `functions/src/creativeResolver.ts` from Spec B
- All user-visible text must be bilingual (Arabic/English) via `useT()` or `appLang` conditional
- FR-010 testimonial slide count auto-update is deferred to Spec G — only value_stack portion is implemented in this spec (T015)
- 36 total tasks across 8 phases
