---
description: "Task list for Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel"
---

# Tasks: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

**Input**: Design documents from `/specs/959-copy-structure-variation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The spec/quickstart request unit tests for the diversity engine and slide-plan rotation, and Constitution Principle IX requires proof for every claimed fix. Backend pure-function tests follow TDD (write first, watch fail). Frontend (23.A) is validated via the quickstart manual QA tables (no frontend test harness in this repo per plan.md).

**Organization**: Tasks grouped by user story. All three sub-tracks (US1/23.A, US2/23.B, US3/23.C) ship in ONE PR (FR-022 requires the carousel code + contract + reference to land together).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 = 23.A, US2 = 23.B, US3 = 23.C
- All paths are absolute-from-repo-root.

## Path Conventions

Web app: frontend `src/`, backend `functions/src/`. Tests in `functions/src/__tests__/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish baseline and new-file scaffolding before any behavior changes.

- [ ] T001 Verify clean baseline: run `cd functions && npm test` (Phase 22 suite green) and `npm run build` + `npm run lint` at repo root; record pass state in the PR description.
- [ ] T002 [P] Create `functions/src/copyDiversity.ts` with the drift-discipline header comment (`// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md §16/§17 — edit the reference first, then sync.`) and exported stub signatures: `makeProjectSeed()`, `biasByMemory()`, `drawDimensions()`, `rotateOpenings()`, `rotateCarouselAngles()`.
- [ ] T003 [P] Create empty test files `functions/src/__tests__/copyDiversity.test.ts` and `functions/src/__tests__/slidePlanRotation.test.ts` with imports + `describe` skeletons.

**Checkpoint**: New modules exist; baseline is green. US1 may begin immediately (it does not depend on Phase 2).

---

## Phase 2: Foundational (Diversity Engine — shared by US2 + US3)

**Purpose**: Cross-project memory + deterministic seed/bias primitives shared by 23.B and 23.C.

**⚠️ NOTE**: US1 (23.A, the MVP) depends ONLY on Phase 1, not on Phase 2. US2 and US3 depend on this phase.

- [ ] T004 Add `DiversityFingerprint` interface (`userId`, `angle`, `dimensionIds[]`, `openingIds[]`, `storyDirectionFamilies?[]`, `middleAngleOrder?[]`, `createdAt`) to `functions/src/creativeMemory.ts` per data-model.md.
- [ ] T005 Implement `recordDiversityFingerprint(fp)` and `getRecentFingerprints(userId, angle, limit=10)` in `functions/src/creativeMemory.ts` — additive write (new fields on the record or a small companion write), read scoped `where userId == … and angle == … order by createdAt desc limit 10`; no migration; legacy records lacking fields are skipped (contract: anti-repetition-memory.md M1, M2, M6, M7).
- [ ] T006 [P] Run `grep -rn "interface ResolutionTrace\|ResolutionTrace =" functions/src` to pin the declaration file before editing, then add an additive optional `copyDiversity` sub-object (`seed`, `drawnDimensionIds?`, `openingIds?`, `storyDirectionFamilies?`, `middleAngleOrder?`, `memoryBiasApplied`, `fingerprintsConsidered`). Do NOT change any existing field (per data-model.md).
- [ ] T007 Implement `makeProjectSeed()` (stable hash of generation/creative id or `userId+projectId+angle`) and `biasByMemory(candidates, recentIds, seed)` in `functions/src/copyDiversity.ts` — deterministic, down-weights recently used ids, NEVER excludes, least-recently-used fallback when all recent (contract: anti-repetition-memory.md M3–M5; hook-dimension-pool.md H5, H8).
- [ ] T008 [P] Write failing tests in `functions/src/__tests__/copyDiversity.test.ts` for `biasByMemory` (never returns empty, prefers least-recent, deterministic for fixed seed+memory) and `makeProjectSeed` (stable, varies by input).

**Checkpoint**: Memory + bias primitives ready and tested. US2 and US3 can proceed (in parallel if staffed).

---

## Phase 3: User Story 1 — In-card variation carousel (Priority: P1) 🎯 MVP

**Goal**: "Generate 4 More Like This" produces an in-card scrollable variation carousel (reference at position 1, variations 2–5, extend to cap 12), with arrows/dots, RTL support, same-angle + deduped variations, and Approve/Edit/AI Edit/Batch acting on the displayed variation.

**Independent Test**: In Step 2, click "Generate 4 More Like This" on a card → 4 variations appear inside that card (positions 2–5), reference preserved at 1, nothing appended to list bottom, actions target the displayed variation. (quickstart 23.A table A1–A9.)

**Depends on**: Phase 1 only.

### Tests for User Story 1

- [ ] T009 [US1] Manual QA harness note: confirm no frontend automated test runner exists; designate quickstart.md §"23.A" table as the acceptance test for this story and link it in the PR.

### Implementation for User Story 1

- [ ] T010 [US1] Backend: extend the single-hook `serverGenerateTOV` `'refresh'` prompt path in `functions/src/generators.ts` to enforce "same resolved angle + same structure + no reused words from the reference hook + dedupe against ALL existing hooks in the set" (reuse the carousel refinement pattern currently at `src/App.tsx` ~L6640-6645), keeping Phase 22 rules (READING_LEVEL/LIVED_SYMPTOM/FABRICATION blocks) and `validateCanonicalHooks` active. NOTE: "same structure" here means the same hook angle-formula/shape within the frozen 4-field model — NOT the Section-5 field-count structures S1–S8, which remain deferred (FR-032 freezes field count). (contract: variation-carousel-state.md "Backend variation contract"; FR-008/009/010).
- [ ] T011 [P] [US1] Store: add `VariationCarouselState` (`variations: Record<HookVariantKey, HookVariation[]>`, `activeIndex`, `capReached`) plus actions `pushVariations(v, list)`, `setActiveIndex(v, i)`, `resetVariations(v)` to `src/store.ts` per data-model.md; cap enforced at 11 variations (12 positions).
- [ ] T011a [US1] Add a parser helper in `src/App.tsx` (or a small co-located util) that converts a returned hook/angle text block into a `HookVariation` using the EXISTING `getSection` extraction (`HOOK_TEXT`/`SUBHEADLINE`/`CTA_BUTTON`/`BENEFIT` for single, or the `ANGLE_START/END` block for carousel), preserving the full block verbatim in `rawBlock` and carrying any `claimFlags`. T013 consumes this helper (data-model.md HookVariation).
- [ ] T012 [US1] UI: render the in-card mini-carousel inside the hook card block in `src/App.tsx` (~L6420-6683) — show the active position, left/right arrows + position dots, reusing the RTL arrow-swap pattern from the lightbox (~L9091); next advances leftward when `lang==='ar'` (FR-001/003/007).
- [ ] T013 [US1] Rewire the "Generate 4 More Like This" handler in `src/App.tsx` (~L6628-6668): STOP the `setTovText(prev => prev + '\n' + res)` append; instead parse each returned block via the T011a helper and push the resulting `HookVariation` objects into `variations[v]` (extend, never reset); enforce cap 12 → on overflow show "carousel is full" notice and DO NOT call backend or `deductCredits`; keep the existing `deductCredits('refreshHooks')` cost on non-refused clicks; on zero valid parsed variations show a non-blocking "couldn't generate fresh variations — try again" notice and leave the carousel unchanged (FR-002/005/006/006a/006b; contract C1–C8).
- [ ] T014 [US1] Make Approve / Edit / AI Edit / Batch resolve the current hook as `activeIndex[v]===0 ? referenceBlock : variations[v][activeIndex-1].rawBlock` so they act on the displayed variation; preserve existing variant-keyed handlers `handleApproveTov`/`handleInlineHookSave`/`handlePrecisionHookEdit`/batch toggle in `src/App.tsx` (FR-004; contract C4).
- [ ] T015 [US1] Carousel-ad mode: when `inputs.adMode==='carousel'`, "Generate 4 More" produces alternative slide-1 hooks via `generateCarouselAngles(...,likeThisPrompt)`; store each returned `ANGLE_START/END` block as a `HookVariation.rawBlock` in the same per-card carousel. The full slide set for a variation is NOT generated upfront — it is materialized only when that variation is selected/approved, via the existing `serverGenerateCarouselSlideCopies` flow (unchanged) (FR-011; contract variation-carousel-state.md).

**Checkpoint**: 23.A fully functional and demoable as the MVP (quickstart 23.A A1–A9 + SC-001/004/005/009/010/011).

---

## Phase 4: User Story 2 — Single-hook anti-sameness (Priority: P2)

**Goal**: Within the locked angle, rotate which 4 dimensions (drawn from a 6–8 pool) and which opening structures fill the hooks per project, biased away from the user's recent ~10 projects — without touching the angle lock or temperature.

**Independent Test**: Run the same locked angle across 5 consecutive new projects → angle identical every time; the 4 dimensions differ in ≥3 of 5 projects; opening structures differ in ≥3 of 5. (quickstart 23.B table B1–B7.)

**Depends on**: Phase 2 (T004–T008).

### Tests for User Story 2 (write first)

- [ ] T016 [P] [US2] Failing tests in `functions/src/__tests__/copyDiversity.test.ts`: `drawDimensions` returns exactly 4 distinct ids and the 4-set varies across consecutive seeds (SC-002, H3); `rotateOpenings` varies subset/order across seeds and uses only the 7 forms (SC-003, H4); memory bias never starves the pool and always returns 4 (SC-008, H5); determinism for fixed `(seed, memory)` (H8).
- [ ] T017 [P] [US2] Failing guard test in `functions/src/__tests__/copyDiversity.test.ts`: every dimension in each `ANGLE_DIMENSION_POOLS[angleId]` can satisfy that angle's `ANGLE_HARD_RULES[angleId]` checkable element (H7, FR-024).

### Implementation for User Story 2

- [ ] T018 [US2] In `functions/src/knowledge/hookAnglesKnowledge.ts`, restructure `ANGLE_VARIATION_BLUEPRINTS` into `ANGLE_DIMENSION_POOLS: Record<string, DimensionEntry[]>` (6–8 per angle): migrate the existing Hook A/B/C/D (Financial/Time/Status/Skill) psychology + Arabic text VERBATIM into pool entries with stable `id`s, and add 2–4 new dimensions per angle in the same voice (data-model.md DimensionEntry/AngleDimensionPool; FR-013, H2). Do NOT touch `ANGLE_HARD_RULES` or the angle id set.
- [ ] T019 [P] [US2] Add the `OpeningStructure` set to `functions/src/copyDiversity.ts` (the 7 forms with their existing one-line templates copied verbatim from `generators.ts` ~L2284-2291) per data-model.md.
- [ ] T020 [US2] Implement `drawDimensions(angleId, count=4, seed, memory)` in `functions/src/copyDiversity.ts` — selects 4 distinct entries WITHIN `ANGLE_DIMENSION_POOLS[angleId]` only, using `biasByMemory` (contract hook-dimension-pool.md H1, H3, H5; FR-012/014).
- [ ] T021 [US2] Implement `rotateOpenings(seed, count=4, memory)` in `functions/src/copyDiversity.ts` — rotates which of the 7 openings the 4 hooks use, memory-biased, never banning (H4, FR-015).
- [ ] T022 [US2] Update `getAngleVariationBlueprint()` (called at `functions/src/generators.ts` ~L2053) to accept and render ONLY the drawn dimension subset instead of the static fixed-4 (H-integration).
- [ ] T023 [US2] Replace the static 7-item opening list block at `functions/src/generators.ts` ~L2284-2291 with the `rotateOpenings(...)` output rendering (do not remove the self-check checklist at ~L2367-2368).
- [ ] T024 [US2] Wire the single-hook generation path in `functions/src/generators.ts`: compute `makeProjectSeed`, read `getRecentFingerprints(userId, angle, 10)`, pass to `drawDimensions`/`rotateOpenings`, record a `DiversityFingerprint` after success, and populate `resolutionTrace.copyDiversity`. Confirm the temperature constants at `generators.ts:2450, 2528` are UNCHANGED (FR-016/018; Principle VI).

**Checkpoint**: 23.B functional and tested (quickstart 23.B B1–B7 + SC-002/003/005/008).

---

## Phase 5: User Story 3 — Carousel anti-sameness (Priority: P3)

**Goal**: Draw the 4 carousel story-direction picker cards as 4-of-7 (rotated + memory-biased per project) and rotate the middle-slide angle order, preserving all slide-plan invariants. Code + spec-001 contract + reference change together (FR-022).

**Independent Test**: Run 5 consecutive new carousel projects → the 4 offered families differ in ≥3 of 5 and middle-slide angle order differs in ≥3 of 5; every plan keeps no-adjacent-repeat, CTA slide 1+last only, photo slide 1 only. (quickstart 23.C C1–C4.)

**Depends on**: Phase 2 (T004–T008).

### Tests for User Story 3 (write first)

- [ ] T025 [P] [US3] Failing tests in `functions/src/__tests__/slidePlanRotation.test.ts`: across multiple seeds the middle-slide order rotates (SC-006/B1); no two adjacent middle slides share an angle (B2); CTA only on slide 1 + last (B3); photo injection only slide 1 (B4); `buildSlidePlan` throws outside 2–9 and short carousels still satisfy B2–B4 (B5); deterministic for `(campaignType, slideCount, seed)` (B6).
- [ ] T026 [P] [US3] Failing tests in `functions/src/__tests__/copyDiversity.test.ts`: `rotateCarouselAngles` returns 4 distinct families drawn from the 7-angle pool, varies across seeds (SC-006/A2), memory-biased never-banned (A4).

### Implementation for User Story 3

- [ ] T027 [US3] Implement `rotateCarouselAngles(campaignType, seed, memory)` in `functions/src/copyDiversity.ts` — draws 4-of-7 from `COLD_ANGLES`/`RETARGETING_ANGLES` (imported from `slidePlanEngine.ts`), rotated + memory-biased; no new taxonomy (contract carousel-angle-rotation.md A1–A4; FR-019).
- [ ] T028 [US3] Modify `buildSlidePlan()` in `functions/src/slidePlanEngine.ts`: change middle assignment from `pool[i % pool.length]` to `pool[(i + offset) % pool.length]` with `offset` derived from a per-project seed parameter; re-verify all invariants in-function (B1–B6; FR-020/021).
- [ ] T029 [US3] Wire `buildSlidePlan` into the live carousel generation path (it is currently exported but unused) so generated carousels use the rotated plan; pass the project seed through (D9).
- [ ] T029a [US3] In `functions/src/generators.ts`, extend `generateCarouselAngles` (~L7068-7296) with narrative prompt descriptions for ALL 7 story-direction families per campaign type — cold A–G (A=Direct value, B=Curiosity, C=Social proof, D=Problem agitation, E=Mechanism, F=Objection pre-emption, G=Identity) and retargeting P/M/R/I/C/Q/E — so any 4-of-7 draw from `rotateCarouselAngles` renders a fully-specified `ANGLE_START` block. No family may fall back to empty/weak guidance (the previously-absent E/F/G and M/R/etc. must each have a description in the same voice as the existing 4). No new taxonomy (FR-019; contract carousel-angle-rotation.md A1–A3).
- [ ] T030 [US3] (depends on T029a) Update `generateCarouselAngles` in `functions/src/generators.ts` (~L7068-7296) to select the 4 `ANGLE_START_A..D` story directions via `rotateCarouselAngles(...)` instead of the hardcoded first-4 families, mapping each drawn family to its T029a description; record `storyDirectionFamilies`/`middleAngleOrder` to the fingerprint + `resolutionTrace.copyDiversity` (A3, FR-019).
- [ ] T031 [P] [US3] Update the spec-001 contract `specs/001-resolver-completeness-trace/contracts/carousel-slide-count-plan.md` to describe the rotated (offset) middle-slide assignment while keeping all invariants explicit (FR-022; contract-sync checklist).
- [ ] T032 [P] [US3] Reconcile `specs/_shared/COPY_SYSTEM_REFERENCE.md` carousel section / the dangling "Section 5.A" pointer (research.md D11): either add a "Section 5.A — Carousel middle-slide plan" mirroring the contract, or fix §17 to point at Section 6 + the spec-001 contract path; note the chosen fix in the PR (FR-022).

**Checkpoint**: 23.C functional, tested, and contract/reference synced (quickstart 23.C C1–C4 + SC-006/007).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify preserved invariants, run full validation, prove no regressions.

- [ ] T033 [P] Preserved-invariant sweep: confirm `MODEL_PROVIDER` line intact at `functions/src/modelConfig.ts:3` (FR-025); commented-out Gemini/Sharp code still commented (FR-026); `captionValidator.ts` + cultural-compliance blocks untouched (FR-024/027); `validateCopyFidelity`/compositor/`textCompositing.ts` untouched (FR-030); copy field count still 4 (FR-032); `COPY_SCORING_DIMENSIONS`/`COPY_REWRITE_DIAGNOSES` still inert/unwired (FR-031); no new Step-2 dropdowns (FR-028); no `creativeTextDirector.ts` introduced (FR-029).
- [ ] T034 Run full `cd functions && npm test` (new diversity + slide-plan tests pass; existing `copyQuality.test.ts` / `contractFixtures.test.ts` stay green) and `npm run build` + `npm run lint` at repo root.
- [ ] T035 Execute the quickstart.md manual QA tables (23.A A1–A9, 23.B B1–B7, 23.C C1–C4) and the preserved-invariant regression sweep; capture before/after evidence per Constitution Principle IX.
- [ ] T036 [P] Verify `resolutionTrace.copyDiversity` audit sub-object is populated for single-hook and carousel generations (Principle VI) and confirm no frontend hosting deploy is performed (FR-033).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks US2 and US3. Does NOT block US1.
- **US1 (Phase 3)**: Depends on Setup only → can ship as the MVP independent of Phase 2/4/5.
- **US2 (Phase 4)**: Depends on Phase 2.
- **US3 (Phase 5)**: Depends on Phase 2. Independent of US2.
- **Polish (Phase 6)**: Depends on all desired stories complete.

### User Story Dependencies

- US1 (P1): independent (Setup only).
- US2 (P2): needs the diversity engine (Phase 2); independent of US1 and US3.
- US3 (P3): needs the diversity engine (Phase 2); independent of US1 and US2.

> **Single-PR note**: although the stories are independent, FR-022 requires all three (and the carousel contract + reference) to land in ONE PR.

### Within Each User Story

- Write the listed tests first (US2/US3 backend), watch them fail, then implement.
- Backend prompt/data changes before frontend wiring (US1: T010 before T012–T015).
- US1: T011a (parser helper) before T013 (handler consumes it).
- US3: T029a (all-7-family descriptions) before T030 (4-of-7 draw maps to them).
- Pools/structures (T018/T019) before drawers (T020/T021) before generator wiring (T022–T024).

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T006, T008 in parallel with T004/T005/T007 sequencing (T005→needs T004; T007 independent).
- US1: T011 (store) parallel with T010 (backend prompt).
- US2: T016, T017 (tests) parallel; T019 parallel with T018.
- US3: T025, T026 (tests) parallel; T031, T032 (docs) parallel with each other and with code tasks.
- Polish: T033, T036 parallel.
- With staff: US1, US2, US3 can be built concurrently once Phase 1+2 are done.

---

## Parallel Example: User Story 2

```bash
# Write failing tests together first:
Task: "drawDimensions/rotateOpenings/bias tests in functions/src/__tests__/copyDiversity.test.ts"  # T016
Task: "ANGLE_HARD_RULES satisfiability guard test in functions/src/__tests__/copyDiversity.test.ts" # T017

# Then build pool + openings in parallel (different files):
Task: "Restructure ANGLE_VARIATION_BLUEPRINTS → pools in functions/src/knowledge/hookAnglesKnowledge.ts" # T018
Task: "Add OpeningStructure set in functions/src/copyDiversity.ts"                                         # T019
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup.
2. Phase 3 US1 (skip Phase 2 — US1 doesn't need it).
3. STOP and validate quickstart 23.A → demo the in-card variation carousel.

### Incremental Delivery (toward the single PR)

1. Setup → Foundational ready.
2. US1 (MVP) → validate 23.A.
3. US2 → validate 23.B.
4. US3 → validate 23.C + sync contract/reference.
5. Polish: invariant sweep + full test/build + quickstart evidence → open the single PR.

---

## Notes

- [P] = different files, no incomplete dependencies.
- The diversity engine (`copyDiversity.ts`) is a pure module so US2/US3 logic is unit-testable in isolation; `generators.ts` only gains call-sites.
- The locked hook angle and the model temperature are NEVER changed (FR-012, FR-018) — verify in T024.
- FR-022 binds T028–T032 together: do not merge carousel code without the matching contract + reference edits.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
