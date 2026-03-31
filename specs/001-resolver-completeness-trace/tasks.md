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
- **Import rule**: Backend local imports MUST use `.js` extension (e.g., `"./entitlements.js"`)

---

## Phase 1: Setup (Dead Code Removal)

**Purpose**: Remove confirmed dead code.

- [X] T001 Delete `functions/src/step3point5.ts` — confirmed dead code, zero imports anywhere in the codebase

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions, resolver input extensions, deleted mode cleanup, before_after reclassification, offer type consolidation, solo-only enforcement. MUST complete before ANY user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Add type definitions to `functions/src/types.ts` — `SlideRole` interface (slide, role, angle, hasCTA, photoInjection), `AutoSwitchEvent` interface (field, from, to, reason), `ValueStackAdjustment` interface (giftCount, originalSlideCount, resolvedSlideCount, capped), `ResolutionTrace` interface (all fields from LAUNCH_MATRIX Section 8 schema / data-model.md)
- [ ] T003 [P] Extend `ResolverInput` interface in `functions/src/creativeResolver.ts` — add `campaignType?: 'cold' | 'retargeting'`, `adFormat?: 'single' | 'carousel' | 'batch'`, `visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal'`, `referenceAdUsed?: boolean`, `selectedSubStyle?: string | null`, `selectedUniverse?: string | null`. Default `visualStyleFamily` to `'realistic'` in `resolveCreativeSpec()` when undefined.
- [ ] T004 Add `soloOnly: boolean` field to `CreativeModeMeta` interface in `functions/src/creativeResolver.ts`. Set `soloOnly: false` on all existing modes except `text_only` which gets `soloOnly: true`.
- [ ] T005 Delete `limited_access`, `module_preview`, `day_strip` from `CREATIVE_MODE_CATALOG` in `functions/src/creativeResolver.ts`
- [ ] T006 Delete all `ALLOWED_PAIRS` entries referencing `limited_access`, `module_preview`, or `day_strip` in `functions/src/creativeResolver.ts`
- [ ] T007 Delete `SUBSTYLE_MODE_COMPAT` entries for `limited_access`, `module_preview`, `day_strip` in `functions/src/creativeResolver.ts` (if present)
- [ ] T008 Add `before_after` to `CREATIVE_MODE_CATALOG` in `functions/src/creativeResolver.ts` with: `tabs: ['mini_course', 'live_events', 'free_guide']`, `role: 'anchor'`, `standaloneAllowed: true`, `soloOnly: true`, `mustShow: ['before_state', 'after_state', 'transformation_divider']`, `mustAvoid: ['single_state_only', 'text_labels_before_after']`, `templateNeeds: ['before_after']`. Fill remaining fields (labelEn: 'Before & After', labelAr: 'قبل وبعد', icon, description, visualHierarchy, textPlacementRules, captionAnchors, validity) following the pattern of existing modes.
- [ ] T009 Remove the `before_after` key from `HOOK_ANGLE_CREATIVE_CONFLICTS` in `functions/src/creativeResolver.ts` — this conflict map entry is no longer needed since before_after is now a creative mode (T008), not a hook angle. The solo-only enforcement (T010) replaces this conflict mechanism.
- [ ] T010 Add solo-only enforcement to `validateCombination()` in `functions/src/creativeResolver.ts` — after the min/max check (line ~254) and mode existence check (line ~257), add: if any selected mode has `soloOnly: true` AND `selectedModes.length > 1`, return error with "{mode label} is a standalone mode and cannot be paired." Check BEFORE the pair validation logic.
- [ ] T011 Update `getTabForOfferType()` in `functions/src/creativeResolver.ts` AND `src/creativeResolver.ts` (frontend mirror) — add `'Live Event': 'live_events'` mapping in both files. Keep old names (`'Free Webinar'`, `'Paid Workshop'`, `'Challenge'`) as fallback for saved projects.
- [ ] T012 [P] Update `OFFER_TYPES` in `src/constants.ts` — reduce to `["Live Event", "Free Guide", "Mini-Course"]`. Update `OFFER_CATEGORY_MAP` to match (add `'Live Event': 'live_events'`, keep old keys as fallback).
- [ ] T013 [P] Remove `before_after` from `COLD_HOOK_ANGLES` array in `src/constants.ts` (currently line ~111). Resulting list: 10 approved hook angles.
- [ ] T014 Centralize the retargeting `hookAngle = null` rule into `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — when `campaignType === 'retargeting'`, set hookAngle to null with reason `'retargeting'`. Remove the scattered inline logic at `functions/src/generators.ts` line ~2072 (verify exact location before removing).

**Checkpoint**: Run `cd functions && npm run build`. Verify clean compile. Verify `before_after` is in mode catalog, not in hook angles. Verify 3 deleted modes are gone.

---

## Phase 3: US1 — Launch Surface Validation (P1)

**Goal**: Block invalid creative combinations with clear reasons on both frontend and backend.

**Independent Test**: Call `validateLaunchSurface()` with every approved combination → all pass. Call with every deleted/invalid combination → all blocked with reason string.

- [ ] T015 [US1] Write `validateLaunchSurface(inputs: ResolverInput): LaunchSurfaceResult` in `functions/src/creativeResolver.ts` — pure function implementing 7 validation rules in order (per contracts/validate-launch-surface.md): (1) deleted mode check, (2) mode-to-tab check, (3) solo-only check, (4) mode pair check, (5) campaign×format×plan check, (6) retargeting objection check, (7) before_after+carousel check. Returns `{ allowed: boolean, reason?: string }`.
- [ ] T016 [US1] Add server-side launch surface guard in `functions/src/index.ts` — immediately after the auth check in the `generateCreative` handler, BEFORE credit owner resolution and BEFORE the credit deduction transaction, call `validateLaunchSurface(inputs)`. If `allowed: false`, throw `HttpsError("permission-denied", reason)`. This ensures no database work or entitlement resolution runs for invalid combinations. Import from `"./creativeResolver.js"`.

**Checkpoint**: Run `cd functions && npm run build`. Test with an invalid combination (e.g., `limited_access` mode) — should be rejected before credit deduction.

---

## Phase 4: US2 — Structured Carousel Slide Plans (P2)

**Goal**: Every carousel slide follows a deterministic narrative structure.

**Independent Test**: Generate plans for cold and retargeting at every slide count 2–9. Verify each slide has correct angle and CTA placement.

- [ ] T017 [US2] Write `carouselSlideCountPlan(campaignType: 'cold' | 'retargeting', slideCount: number): SlideRole[]` in `functions/src/creativeResolver.ts` — pure function with static lookup per contracts/carousel-slide-count-plan.md. Cold pool: A–G (7 angles). Retargeting pool: P, M, R, I, C, Q, E (7 angles). Slide 1 = hook + CTA + photoInjection. Middle = sequential angles, no CTA, no photo. Last = close + CTA. Throw on slideCount < 2 or > 9.

**Checkpoint**: Run `cd functions && npm run build`. Verify `carouselSlideCountPlan('cold', 5)` returns 5 slides with angles [hook, A, B, C, close] and CTA on slides 1 and 5 only.

---

## Phase 5: US3 — Value Stack Carousel Auto-Adjustment (P3)

**Goal**: Carousel slide count auto-adjusts to gift count + 2 with notification data.

**Independent Test**: Provide 3, 4, 8, 9+ gifts → verify resolvedSlideCount = 5, 6, 9, 9 (capped).

- [ ] T018 [US3] Write `resolveValueStackSlideCount(gifts: string[]): ValueStackAdjustment` in `functions/src/creativeResolver.ts` — per contracts/value-stack-functions.md. Filter empty/whitespace strings, calculate `Math.min(nonEmptyCount + 2, 9)`, return adjustment record.

**Checkpoint**: Run `cd functions && npm run build`. Verify `resolveValueStackSlideCount(["A","B","C","D"])` returns `{ giftCount: 4, resolvedSlideCount: 6, capped: false }`.

---

## Phase 6: US4 — Empty Value Stack Field Suppression (P4)

**Goal**: Empty value_stack fields never reach any prompt, blueprint, or rendered output.

**Independent Test**: Submit value_stack input with mixed populated and empty fields → verify only populated fields remain.

- [ ] T019 [US4] Write `filterEmptyValueStackFields(inputs: AdInputs): { filtered: AdInputs; skippedFields: string[] }` in `functions/src/creativeResolver.ts` — per contracts/value-stack-functions.md. Target 9 fields: valueStackTitle, valueStackItems, valueStackBonuses, valueStackPrice, valueStackOriginalValue, valueStackSavings, valueStackGuarantee, valueStackDeliveryFormat, valueStackProofStatement. Strings: remove if undefined/null/empty/whitespace. Arrays: filter empty entries, remove key if array empty. Return shallow copy + skipped field names.

**Checkpoint**: Run `cd functions && npm run build`. Verify `filterEmptyValueStackFields({ valueStackTitle: "Stack", valueStackGuarantee: "" })` returns `{ filtered: { valueStackTitle: "Stack" }, skippedFields: ["valueStackGuarantee"] }`.

---

## Phase 7: US7 — Minimal Style Family Support (P7)

**Goal**: Minimal family suppresses environment rendering while keeping universe dropdown visible.

**Independent Test**: Select minimal family with a universe value → verify no environmental scene in generation.

- [ ] T020 [US7] Verify and update `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — when `visualStyleFamily === 'minimal'`, ensure the resolver output includes `mustAvoid` entries for environment rendering (e.g., `'environmental_scene'`, `'worldbuilding'`, `'location_rendering'`). Confirm the existing minimal universe override at `functions/src/generators.ts` line ~968 is compatible with the new resolver field. If `compileFullContract()` in `functions/src/layoutContract.ts` needs `visualStyleFamily` in its input, add it.

**Checkpoint**: Run `cd functions && npm run build`. Verify minimal family triggers environment suppression flags in resolver output.

---

## Phase 8: US9 — Visual Precedence Chain Enforcement (P9)

**Goal**: Visual input conflicts resolved deterministically via 5-level precedence chain.

**Independent Test**: Provide overlapping visual inputs (reference ad + art direction + universe) → verify highest-priority wins and overrides logged.

- [ ] T021 [US9] Write `resolveVisualPrecedence(inputs: ResolverInput): AutoSwitchEvent[]` in `functions/src/creativeResolver.ts` — per contracts/resolution-trace.md. Apply 5-level chain: (1) Reference Ad overrides universe + art direction, (2) Style Family controls art direction availability, (3) Art Direction overrides universe aesthetic, (4) Universe controls scene, (5) Mode Layout preserved. Special cases: `text_only` suppresses all visual inputs; `minimal` clears art direction and suppresses universe scene. Each override produces an `AutoSwitchEvent`.
- [ ] T022 [US9] Wire `resolveVisualPrecedence()` into `resolveCreativeSpec()` in `functions/src/creativeResolver.ts` — call after mode validation, pass extended inputs. Merge returned `AutoSwitchEvent[]` into the resolver's output for trace consumption.

**Checkpoint**: Run `cd functions && npm run build`. Verify reference ad + art direction produces `referenceAdOverrideActive: true` and art direction suppressed in events.

---

## Phase 9: US5 — Resolution Trace Audit Trail (P5)

**Goal**: Every generation run produces and persists a complete resolution trace.

**Independent Test**: Generate an ad with known inputs → retrieve trace from Firestore → verify all fields populated.

- [ ] T023 [US5] Write `buildResolutionTrace(inputs: AdInputs, resolved: ResolverOutput): ResolutionTrace` in `functions/src/creativeResolver.ts` — per contracts/resolution-trace.md. Populate all fields from `ResolutionTrace` schema: resolvedCampaignType, resolvedAdMode, resolvedCreativeModes, resolvedStyleFamily, resolvedSubStyle, referenceAdOverrideActive, overriddenUniverse/SubStyle, artDirectionCleared + reason, hookAngle + nullReason, objectionId, effectiveObjectionText, modeCompatibilityResult + reason, slideCountOverride data, valueStackEmptyFieldsSkipped, autoSwitchEvents (from visual precedence), perSlide (from carouselSlideCountPlan if carousel), launchMatrixCheckPassed. Handle partial trace on failure (populate available fields).
- [ ] T024 [US5] Wire `buildResolutionTrace()` into generation Cloud Function in `functions/src/index.ts` — call after generation completes (success or failure). Write trace as `resolutionTrace` field on existing `generations/{genId}` document using Firestore `update()`. Wrap in try/catch: trace write failure is logged with `console.warn` but does NOT fail the generation.

**Checkpoint**: Run `cd functions && npm run build`. Generate a test ad and verify the `resolutionTrace` field exists on the generation document in Firestore.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final build verification, contract test baseline, codebase cleanup.

- [ ] T025 Rebuild functions lib: `rm -rf functions/lib && cd functions && npm run build` (or PowerShell: `Remove-Item -Recurse -Force functions/lib; cd functions; npm run build`) — verify clean compile with all changes (per AGENTS.md FIREBASE LIB SYNC rule)
- [ ] T026 Run `cd functions && npm run test:contracts` — verify all existing contract fixture tests pass with the updated resolver
- [ ] T027 Grep entire `functions/src/` for remaining references to `limited_access`, `module_preview`, `day_strip` — verify zero matches. Also grep for `before_after` in hook angle arrays — verify zero matches (it should only appear in `CREATIVE_MODE_CATALOG` and related mode logic).
- [ ] T028 Verify `validateLaunchSurface()` is exported and importable from both `functions/src/creativeResolver.ts` (backend, `.js` extension import) and accessible pattern for `src/creativeResolver.ts` (frontend, bundler import). Confirm the function is a pure function with no Firebase/server dependencies so it can run in both environments.
- [ ] T029 Verify `functions/src/generators.ts` respects `referenceAdOverrideActive` and `artDirectionCleared` from the resolver output when constructing prompts. If existing inline logic already handles reference ad suppression of universe/art direction, confirm it reads from the resolver output (not raw inputs). If not, wire it to consume the resolver's `autoSwitchEvents` or override flags. This is a verification task — may require zero code changes if existing logic is compatible.

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

```
Phase 1 (Setup)
  └── Phase 2 (Foundational) — depends on T001
        ├── Phase 3: US1 (Launch Surface Validation)
        │     └── T016 depends on T015
        ├── Phase 4: US2 (Carousel Slide Plans) — independent after Phase 2
        ├── Phase 5: US3 (Value Stack Auto-Adjust) — independent after Phase 2
        ├── Phase 6: US4 (Empty Field Suppression) — independent after Phase 2
        ├── Phase 7: US7 (Minimal Style Family) — independent after Phase 2
        ├── Phase 8: US9 (Visual Precedence Chain) — independent after Phase 2
        └── Phase 9: US5 (Resolution Trace)
              └── T024 depends on T023
              └── T023 benefits from US1–US4, US7, US9 being complete
  └── Phase 10 (Polish) — depends on all phases complete
```

---

## Parallel Opportunities

### Phase 2: Foundational (same file but non-overlapping sections)

```text
# Parallel batch 1 (different files):
T002: types.ts — new interfaces
T003: creativeResolver.ts — ResolverInput extension
T012: src/constants.ts — OFFER_TYPES reduction
T013: src/constants.ts — before_after removal from COLD_HOOK_ANGLES
Note: T012 and T013 target same file but different arrays — safe if batched.

# Sequential batch 2 (creativeResolver.ts, same file):
T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T014
```

### After Phase 2: User Stories (all independent)

```text
# These can all run in parallel after Phase 2:
T015+T016: US1 — validateLaunchSurface + server guard
T017:      US2 — carouselSlideCountPlan
T018:      US3 — resolveValueStackSlideCount
T019:      US4 — filterEmptyValueStackFields
T020:      US7 — minimal family wiring
T021+T022: US9 — visual precedence chain

# Then US5 (resolution trace) integrates all results:
T023+T024: US5 — buildResolutionTrace + persistence
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (delete dead code)
2. Complete Phase 2: Foundational (types + resolver extension + mode cleanup + before_after + offer types)
3. Complete Phase 3: US1 (launch surface validation + server guard)
4. **STOP and VALIDATE**: Run `npm run build` + `npm run test:contracts`. Verify invalid combos are rejected.
5. This delivers immediate value: no more invalid combinations reaching the generation pipeline.

### Incremental Delivery

1. Setup + Foundational → Foundation ready, 3 deleted modes gone, before_after reclassified, offer types consolidated
2. Add US1 → Invalid combinations blocked server-side → Deploy/Demo (MVP!)
3. Add US2 → Carousel slide plans deterministic → Deploy/Demo
4. Add US3 → Value stack slide count auto-adjusts → Deploy/Demo
5. Add US4 → Empty fields never appear in output → Deploy/Demo
6. Add US7 → Minimal family properly handled → Deploy/Demo
7. Add US9 → Visual precedence chain enforced → Deploy/Demo
8. Add US5 → Full resolution trace persisted → Deploy/Demo (complete Phase 1)
9. Polish → Build clean, tests pass, no stale references

---

## Notes

- [P] tasks target different files or non-overlapping sections — safe to parallelize
- [Story] labels map tasks to user stories from spec.md for traceability
- US6 (Deleted Modes) absorbed into Phase 2 Foundational (T005–T007)
- US8 (before_after reclassification, offer type consolidation) absorbed into Phase 2 (T008–T013)
- Each user story is independently completable and testable after Phase 2
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Build verification: `cd functions && npm run build` must pass after every task
- Per AGENTS.md: Always `Remove-Item -Recurse -Force functions/lib` before rebuilding
- 29 total tasks across 10 phases
