# Tasks: Resolver Completeness, Resolution Trace & Slide Plans

**Input**: Design documents from `/specs/001-resolver-completeness-trace/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No test tasks in this phase. Spec D (Phase 3 in LAUNCH_MATRIX) adds 11 priority lane fixtures separately.

**Organization**: Tasks grouped by user story to enable independent implementation and testing. US6 (Deleted Modes) and US8 (before_after reclassification, offer type consolidation) absorbed into Phase 2 as prerequisites for US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `functions/src/` (Cloud Functions, TypeScript 5.7, NodeNext moduleResolution)
- **Frontend mirror**: `src/` (React, TypeScript 5.9, bundler moduleResolution)
- **Import rule**: Backend local imports MUST use `.js` extension (e.g., `"./launchSurface.js"`)

---

## Phase 1: Setup (Dead Code Removal)

**Purpose**: Remove confirmed dead code.

- [x] T001 Delete `functions/src/step3point5.ts` — confirmed dead code, zero imports anywhere in the codebase

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions, new module scaffolding, deleted mode cleanup across ALL files, before_after reclassification, offer type consolidation, solo-only enforcement. MUST complete before ANY user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2A: Type definitions and new file scaffolding

- [x] T002 [P] Add type definitions to `functions/src/types.ts` — `SlideEntry` interface (slide, role, hasCTA, narrativeAngle, photoInjection, testimonialPlatform?), `AutoSwitchEvent` interface (field, from, to, reason), `ValueStackAdjustment` interface (giftCount, originalSlideCount, resolvedSlideCount, capped), `ResolutionTrace` interface (all fields from LAUNCH_MATRIX Section 8 / data-model.md), `LaunchSurfaceInput` interface, `LaunchSurfaceResult` interface, `FilterResult` interface (filteredInput, skippedFields)- [x] T003 [P] Create `functions/src/launchSurface.ts` — scaffold with: `OfferTypeId`, `TabId`, `LegacyOfferTypeId` types, `OFFER_TYPE_ENTRIES` constant (3 offer types with legacy aliases), `TAB_MODE_REGISTRY` constant (approved modes + pairings per tab from LAUNCH_MATRIX), `CAMPAIGN_FORMAT_MATRIX` constant, `SOLO_ONLY_MODES` constant (`['before_after', 'text_only']`), `DELETED_MODES` constant (`['limited_access', 'module_preview', 'day_strip']`), `APPROVED_HOOK_ANGLES` constant (10 angles). Export `validateLaunchSurface` stub (implementation in Phase 3).
- [x] T004 [P] Create `functions/src/slidePlanEngine.ts` — scaffold with `COLD_ANGLES` constant (A–G), `RETARGETING_ANGLES` constant (P, M, R, I, C, Q, E), export `buildSlidePlan` stub and `resolveValueStackSlideCount` stub (implementations in Phases 4–5).
- [x] T005 [P] Create `functions/src/resolutionTrace.ts` — scaffold with `createTraceBuilder()` function returning a `TraceBuilder` object with setter methods per contracts/resolution-trace.md, export `persistTrace(genId, trace)` stub (implementation in Phase 9).
- [x] T006 [P] Create `functions/src/emptyFieldFilter.ts` — scaffold with `VALUE_STACK_FIELDS` constant (9 canonical fields from spec clarifications), export `filterEmptyValueStackFields` stub (implementation in Phase 6).

### 2B: Resolver input extension and solo-only support

- [x] T007 Extend `ResolverInput` interface in `functions/src/creativeResolver.ts` — add `campaignType?: 'cold' | 'retargeting'`, `adFormat?: 'single' | 'carousel' | 'batch'`, `visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal'`, `referenceAdUsed?: boolean`, `selectedSubStyle?: string | null`, `selectedUniverse?: string | null`. Default `visualStyleFamily` to `'realistic'` in `resolveCreativeSpec()` when undefined.
- [x] T008 Add `soloOnly: boolean` field to `CreativeModeMeta` interface in `functions/src/creativeResolver.ts`. Set `soloOnly: false` on all existing modes except `text_only` which gets `soloOnly: true`.

### 2C: Deleted mode removal (ALL files)

- [x] T009 Delete `limited_access`, `module_preview`, `day_strip` from `CREATIVE_MODE_CATALOG` in `functions/src/creativeResolver.ts`
- [x] T010 Delete all `ALLOWED_PAIRS` entries referencing `limited_access`, `module_preview`, or `day_strip` in `functions/src/creativeResolver.ts`
- [x] T011 Delete `SUBSTYLE_MODE_COMPAT` entries for `limited_access`, `module_preview`, `day_strip` in `functions/src/creativeResolver.ts` (if present)
- [x] T012 [P] Delete `limited_access`, `module_preview`, `day_strip` keyword entries from `functions/src/captionValidator.ts` (lines ~192-206, the mode-specific anchor keyword dictionaries)
- [x] T013 [P] Delete plan gate entries for `limited_access`, `module_preview`, `day_strip` from `functions/src/selectorLimits.ts` (lines ~39-45)
- [x] T014 [P] Remove `limited_access`, `module_preview`, `day_strip` from VALID_MODES set in `functions/src/patternSummaries.ts` (lines ~83-87)
- [x] T015 [P] Remove field schema definitions for `limited_access`, `module_preview`, `day_strip` from `functions/src/modeFieldSchema.ts`
- [x] T016 [P] Remove mode definitions for `limited_access`, `module_preview`, `day_strip` from `functions/src/knowledge/offerCreativeModes.ts`
- [x] T017 [P] Remove plan gate indices for `limited_access`, `module_preview`, `day_strip` from `functions/src/entitlements.ts`

### 2D: before_after reclassification and offer type consolidation

- [x] T018 Add `before_after` to `CREATIVE_MODE_CATALOG` in `functions/src/creativeResolver.ts` with: `tabs: ['mini_course', 'live_events', 'free_guide']`, `role: 'anchor'`, `standaloneAllowed: true`, `soloOnly: true`, `mustShow: ['before_state', 'after_state', 'transformation_divider']`, `mustAvoid: ['single_state_only', 'text_labels_before_after']`, `templateNeeds: ['before_after']`. Fill remaining fields (labelEn: 'Before & After', labelAr: 'قبل وبعد', icon, description, visualHierarchy, textPlacementRules, captionAnchors, validity) following the pattern of existing modes.
- [x] T019 Remove the `before_after` key from `HOOK_ANGLE_CREATIVE_CONFLICTS` in `functions/src/creativeResolver.ts` — no longer needed since before_after is now a creative mode (T018), not a hook angle. Solo-only enforcement (T021) replaces this conflict mechanism.
- [x] T020 [P] Remove `before_after` from `COLD_HOOK_ANGLES` array in `src/constants.ts` (currently line ~111). Resulting list: 10 approved hook angles.
- [x] T020a [P] Remove `before_after` entries from `functions/src/knowledge/hookAnglesKnowledge.ts` — delete the `before_after` key from hook angle definitions (line ~19), prompt templates (line ~490), visual anchors (line ~747), and any `before_after__*` prefixed hook variants (lines ~787-788). After removal, `before_after` should only exist in `CREATIVE_MODE_CATALOG` (T018).
- [x] T021 Add solo-only enforcement to `validateCombination()` in `functions/src/creativeResolver.ts` — after the min/max check (line ~254) and mode existence check (line ~257), add: if any selected mode has `soloOnly: true` AND `selectedModes.length > 1`, return error with "{mode label} is a standalone mode and cannot be paired." Check BEFORE the pair validation logic.
- [x] T022 Update `getTabForOfferType()` in `functions/src/creativeResolver.ts` AND `src/creativeResolver.ts` (frontend mirror) — add `'Live Event': 'live_events'` mapping in both files. Keep old names (`'Free Webinar'`, `'Paid Workshop'`, `'Challenge'`) as fallback for saved projects.
- [x] T023 [P] Update `OFFER_TYPES` in `src/constants.ts` — reduce to `["Live Event", "Free Guide", "Mini-Course"]`. Update `OFFER_CATEGORY_MAP` to match (add `'Live Event': 'live_events'`, keep old keys as fallback).

### 2E: Centralize retargeting hook angle clearing

- [x] T024 Centralize the retargeting `hookAngle = null` rule into `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — when `campaignType === 'retargeting'`, set hookAngle to null with reason `'retargeting_selected'`. Remove the scattered inline logic at `functions/src/generators.ts` line ~2072 (verify exact location before removing).

**Checkpoint**: Run `cd functions && npm run build`. Verify clean compile. Verify `before_after` is in mode catalog, not in hook angles. Verify 3 deleted modes are gone from all files.

---

## Phase 3: US1 — Launch Surface Validation (P1)

**Goal**: Block invalid creative combinations with clear reasons on both frontend and backend.

**Independent Test**: Call `validateLaunchSurface()` with every approved combination → all pass. Call with every deleted/invalid combination → all blocked with reason string.

- [x] T025 [US1] Implement `validateLaunchSurface(input: LaunchSurfaceInput): LaunchSurfaceResult` in `functions/src/launchSurface.ts` — pure function implementing 9 validation rules in order (per contracts/validate-launch-surface.md): (1) deleted mode check, (2) offer type resolution (legacy aliases → canonical), (3) campaign×format×plan check, (4) tab mode check, (5) solo-only check, (6) pairing check (return layoutKey), (7) hook angle check (cold only, 10 approved angles), (8) format restriction (before_after single-only), (9) batch N cap (hooks × concepts × sizes ≤ 30).
- [x] T026 [US1] Add server-side launch surface guard in `functions/src/index.ts` — immediately after the auth check in the `generateCreative` handler, BEFORE credit owner resolution and BEFORE the credit deduction transaction, call `validateLaunchSurface(inputs)`. If `passed: false`, throw `HttpsError("permission-denied", blockReason)`. This ensures no database work or entitlement resolution runs for invalid combinations. Import from `"./launchSurface.js"`.

**Checkpoint**: Run `cd functions && npm run build`. Test with an invalid combination (e.g., `limited_access` mode) — should be rejected before credit deduction.

---

## Phase 4: US2 — Structured Carousel Slide Plans (P2)

**Goal**: Every carousel slide follows a deterministic narrative structure.

**Independent Test**: Generate plans for cold and retargeting at every slide count 2–9. Verify each slide has correct angle and CTA placement.

- [x] T027 [US2] Implement `buildSlidePlan(campaignType: 'cold' | 'retargeting', slideCount: number): SlideEntry[]` in `functions/src/slidePlanEngine.ts` — pure function with static lookup per contracts/carousel-slide-count-plan.md. Cold pool: A–G (7 angles). Retargeting pool: P, M, R, I, C, Q, E (7 angles). Slide 1 = hook + CTA + photoInjection. Middle = sequential angles from pool (first N-2), no CTA, no photo. Last = close + CTA. Throw on slideCount < 2 or > 9.

**Checkpoint**: Run `cd functions && npm run build`. Verify `buildSlidePlan('cold', 5)` returns 5 slides with angles [hook, A, B, C, close] and CTA on slides 1 and 5 only.

---

## Phase 5: US3 — Value Stack Carousel Auto-Adjustment (P3)

**Goal**: Carousel slide count auto-adjusts to gift count + 2 with notification data.

**Independent Test**: Provide 3, 4, 8, 9+ gifts → verify resolvedSlideCount = 5, 6, 9, 9 (capped).

- [x] T028 [US3] Implement `resolveValueStackSlideCount(giftCount: number, userSelectedCount: number): ValueStackAdjustment` in `functions/src/slidePlanEngine.ts` — per contracts/carousel-slide-count-plan.md. Calculate `Math.min(giftCount + 2, 9)`, return `{ giftCount, originalSlideCount: userSelectedCount, resolvedSlideCount, capped: giftCount + 2 > 9 }`.

**Checkpoint**: Run `cd functions && npm run build`. Verify `resolveValueStackSlideCount(4, 5)` returns `{ giftCount: 4, originalSlideCount: 5, resolvedSlideCount: 6, capped: false }`.

---

## Phase 6: US4 — Empty Value Stack Field Suppression (P4)

**Goal**: Empty value_stack fields never reach any prompt, blueprint, or rendered output.

**Independent Test**: Submit value_stack input with mixed populated and empty fields → verify only populated fields remain.

- [x] T029 [US4] Implement `filterEmptyValueStackFields(input: Record<string, unknown>): FilterResult` in `functions/src/emptyFieldFilter.ts` — per contracts/value-stack-functions.md. Target 9 canonical fields: valueStackTitle, valueStackItems, valueStackBonuses, valueStackPrice, valueStackOriginalValue, valueStackSavings, valueStackGuarantee, valueStackDeliveryFormat, valueStackProofStatement. Strings: suppress if undefined/null/empty/whitespace. Arrays: filter empty entries, suppress key if array becomes empty. Return new object (no mutation) + skipped field names.

**Checkpoint**: Run `cd functions && npm run build`. Verify `filterEmptyValueStackFields({ valueStackTitle: "Stack", valueStackGuarantee: "" })` returns `{ filteredInput: { valueStackTitle: "Stack" }, skippedFields: ["valueStackGuarantee"] }`.

---

## Phase 7: US7 — Minimal Style Family Support (P7)

**Goal**: Minimal family suppresses environment rendering while keeping universe dropdown visible.

**Independent Test**: Select minimal family with a universe value → verify no environmental scene in generation.

- [x] T030 [US7] Update `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — when `visualStyleFamily === 'minimal'`, ensure the resolver output includes `mustAvoid` entries for environment rendering (e.g., `'environmental_scene'`, `'worldbuilding'`, `'location_rendering'`). Confirm the existing minimal universe override at `functions/src/generators.ts` line ~968 is compatible with the new resolver field. If `compileFullContract()` in `functions/src/layoutContract.ts` needs `visualStyleFamily` in its input, add it.

**Checkpoint**: Run `cd functions && npm run build`. Verify minimal family triggers environment suppression flags in resolver output.

---

## Phase 8: US9 — Visual Precedence Chain Enforcement (P9)

**Goal**: Visual input conflicts resolved deterministically via 5-level precedence chain.

**Independent Test**: Provide overlapping visual inputs (reference ad + art direction + universe) → verify highest-priority wins and overrides logged.

- [x] T031 [US9] Write `resolveVisualPrecedence(inputs: ResolverInput): AutoSwitchEvent[]` in `functions/src/creativeResolver.ts` — per contracts/resolution-trace.md. Apply 5-level chain: (1) Reference Ad overrides universe + art direction, (2) Style Family controls art direction availability; minimal clears art direction + suppresses universe scene — this also satisfies FR-015 (clear art direction on family switch), (3) Art Direction overrides universe aesthetic, (4) Universe controls scene, (5) Mode Layout preserved. Special cases: `text_only` suppresses all visual inputs. Each override produces an `AutoSwitchEvent` with reason logged for trace.
- [x] T032 [US9] Wire `resolveVisualPrecedence()` into `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — call after mode validation, pass extended inputs. Merge returned `AutoSwitchEvent[]` into the resolver's output for trace consumption.

**Checkpoint**: Run `cd functions && npm run build`. Verify reference ad + art direction produces an event with `field: 'subStyle', from: 'luxury_magazine', to: 'suppressed', reason: 'reference_ad_override'`.

---

## Phase 9: US5 — Resolution Trace Audit Trail (P5)

**Goal**: Every generation run produces and persists a complete resolution trace.

**Independent Test**: Generate an ad with known inputs → retrieve trace from Firestore → verify all fields populated.

- [x] T033 [US5] Implement `createTraceBuilder(): TraceBuilder` in `functions/src/resolutionTrace.ts` — per contracts/resolution-trace.md. Builder provides setter methods: `setResolved()`, `setHookAngle()`, `setObjection()`, `setModeCompatibility()`, `setReferenceAdOverride()`, `setArtDirectionCleared()`, `setSlideCountOverride()`, `setEmptyFieldsSkipped()`, `addAutoSwitchEvent()`, `setPerSlide()`, `setLaunchCheck()`. `build()` validates mandatory fields are set and returns a frozen `ResolutionTrace` object. `autoSwitchEvents` defaults to `[]`.
- [x] T034 [US5] Implement `persistTrace(genId: string, trace: ResolutionTrace): Promise<void>` in `functions/src/resolutionTrace.ts` — write `{ resolutionTrace: trace }` to `generations/{genId}` document using `updateDoc`. Wrap in try/catch: on failure, `console.warn('Trace persistence failed for ${genId}:', error)` — never throw. Single attempt, no retry.
- [x] T035 [US5] Wire trace building into `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — after all resolution steps complete, call `createTraceBuilder()` and populate from: launch surface result, resolved modes, style family, visual precedence events, slide plan (if carousel), empty field filter results, hook angle + null reason, objection data. Return the built `ResolutionTrace` as part of the resolver output.
- [x] T036 [US5] Wire `persistTrace()` into `generateCreative` Cloud Function in `functions/src/index.ts` — call after generation pipeline starts (not blocking). Import from `"./resolutionTrace.js"`. Trace should be persisted even on partial failure (populate available fields).

**Checkpoint**: Run `cd functions && npm run build`. Generate a test ad and verify the `resolutionTrace` field exists on the generation document in Firestore.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final build verification, contract test baseline, codebase cleanup, performance validation.

- [x] T037 Rebuild functions lib: `rm -rf functions/lib && cd functions && npm run build` (or PowerShell: `Remove-Item -Recurse -Force functions/lib; cd functions; npm run build`) — verify clean compile with all changes
- [x] T038 Run `cd functions && npm run test:contracts` — verify all existing contract fixture tests pass with the updated resolver
- [x] T039 Grep entire `functions/src/` for remaining references to `limited_access`, `module_preview`, `day_strip` — verify zero matches. Also grep for `before_after` in hook angle arrays — verify zero matches (it should only appear in `CREATIVE_MODE_CATALOG` and related mode logic).
- [x] T040 Verify `validateLaunchSurface()` is exported from `functions/src/launchSurface.ts` and importable via `"./launchSurface.js"`. Confirm the function is pure (no Firebase/server dependencies) so the validation logic can be mirrored in the frontend (Spec C).
- [x] T041 Verify `functions/src/generators.ts` respects `referenceAdOverrideActive` and `artDirectionCleared` from the resolver output when constructing prompts. If existing inline logic already handles reference ad suppression of universe/art direction, confirm it reads from the resolver output (not raw inputs). If not, wire it to consume the resolver's `autoSwitchEvents` or override flags. This is a verification task — may require zero code changes if existing logic is compatible.
- [x] T042 Add a timing check in `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — wrap the resolver body with `const start = performance.now()` / `const elapsed = performance.now() - start`. Log `console.warn('Resolver exceeded 50ms target:', elapsed)` if `elapsed > 50`. This validates SC-004a (< 50ms p95) at runtime without blocking.

**Deferred to Spec C (Frontend Enforcement)**:
- FR-002 frontend half: inline blocking message below invalid combinations in `InputForm.tsx`
- FR-009: user-facing notification "Carousel adjusted to N slides" when value_stack override fires
- FR-015 frontend half: art direction card clearing on family switch in UI
- US8 frontend half: before_after in creative mode grid, removed from hook angle selector UI
- US8 frontend half: offer type dropdown showing 3 entries in UI
- Non-launch languages hidden from selector
- Override signals (toasts/banners) from LAUNCH_MATRIX Section 7

---

## Dependencies

```text
Phase 1 (Setup)
  └── Phase 2 (Foundational) — depends on T001
        │
        ├── 2A: Scaffolding (T002–T006) — all [P], no dependencies
        ├── 2B: Resolver extension (T007–T008) — sequential, same file
        ├── 2C: Deleted modes (T009–T017) — T009-T011 sequential (same file),
        │        T012–T017 [P] (different files, can run parallel with each other
        │        AND parallel with T009-T011)
        ├── 2D: Reclassification (T018–T023) — depends on 2C complete
        │        T020, T023 [P] (different file: src/constants.ts)
        └── 2E: Hook centralization (T024) — depends on 2B
        │
        ├── Phase 3: US1 (Launch Surface) — depends on T003 (launchSurface.ts scaffold)
        │     └── T026 depends on T025
        ├── Phase 4: US2 (Slide Plans) — depends on T004 (slidePlanEngine.ts scaffold)
        ├── Phase 5: US3 (Value Stack Auto-Adjust) — depends on T004
        ├── Phase 6: US4 (Empty Field Suppression) — depends on T006 (emptyFieldFilter.ts scaffold)
        ├── Phase 7: US7 (Minimal Family) — depends on T007 (ResolverInput extension)
        ├── Phase 8: US9 (Visual Precedence) — depends on T007
        └── Phase 9: US5 (Resolution Trace) — depends on T005 (resolutionTrace.ts scaffold)
              └── T035 benefits from US1–US4, US7, US9 being complete
              └── T036 depends on T033, T034
  └── Phase 10 (Polish) — depends on all phases complete
```

---

## Parallel Opportunities

### Phase 2: Foundational

```text
# Parallel batch 1 (all different files — fully parallel):
T002: types.ts
T003: launchSurface.ts (new)
T004: slidePlanEngine.ts (new)
T005: resolutionTrace.ts (new)
T006: emptyFieldFilter.ts (new)
T012: captionValidator.ts (deleted modes)
T013: selectorLimits.ts (deleted modes)
T014: patternSummaries.ts (deleted modes)
T015: modeFieldSchema.ts (deleted modes)
T016: offerCreativeModes.ts (deleted modes)
T017: entitlements.ts (deleted modes)
T020: src/constants.ts (before_after hook removal)
T023: src/constants.ts (offer types) — safe with T020 if batched

# Sequential batch 2 (creativeResolver.ts — same file):
T007 → T008 → T009 → T010 → T011 → T018 → T019 → T021 → T022 → T024
```

### After Phase 2: User Stories (all independent)

```text
# These can all run in parallel after Phase 2:
T025+T026: US1 — validateLaunchSurface + server guard
T027:      US2 — buildSlidePlan
T028:      US3 — resolveValueStackSlideCount
T029:      US4 — filterEmptyValueStackFields
T030:      US7 — minimal family wiring
T031+T032: US9 — visual precedence chain

# Then US5 (resolution trace) integrates all results:
T033+T034+T035+T036: US5 — trace builder + persistence + wiring
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (delete dead code)
2. Complete Phase 2: Foundational (types + scaffolding + mode cleanup + reclassification + offer types)
3. Complete Phase 3: US1 (launch surface validation + server guard)
4. **STOP and VALIDATE**: Run `npm run build` + `npm run test:contracts`. Verify invalid combos are rejected.
5. This delivers immediate value: no more invalid combinations reaching the generation pipeline.

### Incremental Delivery

1. Setup + Foundational → Foundation ready, 3 deleted modes gone from ALL files, before_after reclassified, offer types consolidated, 4 new modules scaffolded
2. Add US1 → Invalid combinations blocked server-side → Deploy/Demo (MVP!)
3. Add US2 → Carousel slide plans deterministic → Deploy/Demo
4. Add US3 → Value stack slide count auto-adjusts → Deploy/Demo
5. Add US4 → Empty fields never appear in output → Deploy/Demo
6. Add US7 → Minimal family properly handled → Deploy/Demo
7. Add US9 → Visual precedence chain enforced → Deploy/Demo
8. Add US5 → Full resolution trace persisted → Deploy/Demo (Spec B complete)
9. Polish → Build clean, tests pass, no stale references, performance validated

---

## Notes

- [P] tasks target different files or non-overlapping sections — safe to parallelize
- [Story] labels map tasks to user stories from spec.md for traceability
- US6 (Deleted Modes) absorbed into Phase 2C (T009–T017)
- US8 (before_after reclassification, offer type consolidation) absorbed into Phase 2D (T018–T023)
- Each user story is independently completable and testable after Phase 2
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Build verification: `cd functions && npm run build` must pass after every task
- Per AGENTS.md: Always `Remove-Item -Recurse -Force functions/lib` before rebuilding
- 43 total tasks across 10 phases
- Key change from previous tasks: Functions split into 4 new files (launchSurface, slidePlanEngine, resolutionTrace, emptyFieldFilter) per plan.md separation of concerns — resolver is already 1,133 lines
