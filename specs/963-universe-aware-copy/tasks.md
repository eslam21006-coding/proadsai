---
description: "Task list for Phase 27 — Universe-Aware Copy"
---

# Tasks: Universe-Aware Copy

**Input**: Design documents from `/specs/963-universe-aware-copy/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/universe-copy-decision.md ✅

**Tests**: REQUIRED for this feature. The spec defines explicit test expectations, `contracts/universe-copy-decision.md` defines Contracts A–E, and Constitution Principles IV (behavior contracts) + IX (proof for every fix) mandate them. The mapper is pure, so tests follow the existing `gazeMap.test.ts` / `expressionMap.test.ts` assert-shell.

**Organization**: Tasks grouped by user story. The shared decision logic is Foundational (it encodes the reasons for every story); each story phase wires + proves its specific behavior.

**Implementer note (Minimax — no memory)**: This is a BACKEND prompt-engineering change. Mirror Phase 19 (`functions/src/gazeMap.ts` + `__tests__/gazeMap.test.ts`) and Phase 28 (`functions/src/expressionMap.ts` + `__tests__/expressionMap.test.ts`) EXACTLY — read both before starting. The new module is pure/side-effect-free (no Gemini calls). All anchors below were verified in `research.md`; **re-confirm line numbers before editing** (the file is ~5700 lines and may drift).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files / independent, no incomplete dependencies)
- **[Story]**: US1–US6 (Foundational/Setup/Polish have no story label)
- Every task gives an exact file path.

## Path Conventions

Backend-only: `functions/src/` (TypeScript 5.7, compiled by `tsc` to `functions/lib/`). No frontend, no Firestore migration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the codebase state before any edit.

- [ ] T001 Re-confirm the four primary anchors in `functions/src/generators.ts` still match `research.md`: the `METAPHOR RULE` block (~L1899–1915, `generateTOV` mode `initial`), the inline `UNIVERSE/THEME USAGE` line (~L2020, `generateTOV` mode `refresh`), the `expressionAdaptation` trace write (~L5605) and `gazeDirection` trace write (~L5658) in `generateFinalAd`, plus `resolveStyleFamily` (L309) and `isTextOnlyMode` (L562). Record the actual current line numbers in a scratch note for use by later tasks. Do NOT edit yet.
- [ ] T002 [P] Read `functions/src/gazeMap.ts`, `functions/src/expressionMap.ts`, `functions/src/__tests__/gazeMap.test.ts`, and `functions/src/__tests__/expressionMap.test.ts` end-to-end to internalize the pure-mapper + assert-shell pattern this feature must copy.

**Checkpoint**: Anchors confirmed, reference pattern understood.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure mapper (decision + block builders) and the trace type. EVERY user story depends on these. ⚠️ No story can start until Phase 2 is done.

- [ ] T003 Add the additive optional `universeAwareCopy?` field to the `ResolutionTrace` interface in `functions/src/types.ts`, immediately after the `gazeDirection?` field (~L443). Shape EXACTLY per `data-model.md` § 1: `{ readonly applied: boolean; readonly styleFamily: "fantasy" | "realistic" | "minimal"; readonly reason: UniverseCopyReason }`. Include the explanatory comment block (prompt-level, never null styleFamily, additive/no-migration). Import or inline the `UniverseCopyReason` union so `types.ts` compiles.
- [ ] T004 Create new file `functions/src/universeCopyMap.ts` with the exported types from `data-model.md` § 2: `StyleFamily`, `UniverseCopyReason` (the 6-value union), `UniverseCopyDecisionArgs`, `UniverseCopyDecision`. File must be pure (no imports with side effects, no Gemini/Firebase).
- [ ] T005 In `functions/src/universeCopyMap.ts`, implement `resolveUniverseCopyDecision(args: UniverseCopyDecisionArgs): UniverseCopyDecision` using the EXACT first-match precedence from `data-model.md` § 4 / `contracts` Contract A: (1) referenceAdPresent→`reference-ad-override`, (2) isTextOnly→`text-only-mode`, (3) isCarouselNonHookSlide→`carousel-non-hook-slide`, (4) fantasy→`fantasy-universe-metaphor-active` (applied:true), (5) minimal→`minimal-no-metaphor`, (6) else→`realistic-no-metaphor`. `styleFamily` always echoed back unchanged (never null); function must be total (never throws for any input).
- [ ] T006 In `functions/src/universeCopyMap.ts`, add the shared strict-rule constants by lifting the EXISTING text VERBATIM from `generators.ts`: `STRICT_METAPHOR_BLOCK` = the current L1899–1915 block, and `STRICT_METAPHOR_REFRESH_LINE` = the current L2020 line. Byte-for-byte identical (Contract E depends on this). Do not paraphrase.
- [ ] T007 In `functions/src/universeCopyMap.ts`, implement `buildFantasyMetaphorCopyBlock(resolvedUniverse: string, customUniverseDetails?: string): string` — the RELAXED rule. It MUST: permit ONE subtle evocative universe-echoing word/short phrase; forbid full thematic sentences / image-dependent copy ("must stand on its own"); state the metaphor may appear in headline, subheadline, CTA, or benefit (Gemini's choice); prefer `customUniverseDetails` text when present, else `resolvedUniverse`; and restate the Arabic-quality guardrails (no leading و, self-contained phrasing, cultural compliance — NFR-005). Advisory tone only (no "reject"/"fail" language — no enforcement pass).
- [ ] T008 In `functions/src/universeCopyMap.ts`, implement `buildBlueprintMetaphorVisualBlock(resolvedUniverse: string): string` — the blueprint instruction: "if the copy uses a universe metaphor, describe ONE matching visual element so the rendered image reflects it coherently," anchored to `resolvedUniverse`, subordinate to existing identity/costume rules (must not override them). FR-005.
- [ ] T009 Create `functions/src/__tests__/universeCopyMap.test.ts` following the `gazeMap.test.ts` assert-shell (local `assert(cond,label)`, pass/fail counter, Contract sections, `process.exit(1)` on failure). Implement **Contract A** (all 10 rows A1–A10 from `contracts/universe-copy-decision.md`) and **Contract E** (E1–E3: assert `STRICT_METAPHOR_BLOCK` / `STRICT_METAPHOR_REFRESH_LINE` are non-empty and that a neutralized/strict decision path yields the strict text — byte-identity guard). Wire it into the test runner the same way as `gazeMap`/`expressionMap` (`functions/package.json` script + `npm test`).

**Checkpoint**: `cd functions; npm run build; node lib/__tests__/universeCopyMap.test.js` is green for Contracts A + E. The decision engine + blocks + type exist and are proven in isolation — user stories can now wire them in.

---

## Phase 3: User Story 1 — Fantasy universe gets a subtle, coherent metaphor (Priority: P1) 🎯 MVP

**Goal**: Fantasy single-ad runs emit the relaxed copy block + the blueprint visual instruction, and record `applied:true`.

**Independent Test**: Generate a single fantasy-universe ad with a hook → assembled copy prompt carries the relaxed block (strict absent), build plan carries the visual-coherence instruction, trace = `{applied:true, styleFamily:'fantasy', reason:'fantasy-universe-metaphor-active'}`.

- [ ] T010 [US1] In `functions/src/generators.ts` `generateTOV()` mode `initial` (~L1899–1915), replace the inline strict block with a conditional: compute the copy-time decision via `resolveUniverseCopyDecision({ styleFamily: resolveStyleFamily(inputs), referenceAdPresent: <ref-ad check>, isTextOnly: isTextOnlyMode(inputs), isCarouselNonHookSlide: false })` and emit `buildFantasyMetaphorCopyBlock(resolvedUniverse, inputs.customUniverseDetails)` when `applied`, else `STRICT_METAPHOR_BLOCK`. Retain the original strict text as a commented reference pointing to the shared constant (FR-016). (`isCarouselNonHookSlide:false` because copy is authored for the hook slide.)
- [ ] T011 [US1] In `functions/src/generators.ts` `generateTOV()` mode `refresh` (~L2020), apply the same conditional swap using `STRICT_METAPHOR_REFRESH_LINE` vs. the relaxed block (refresh-appropriate phrasing). Keep original line commented.
- [ ] T012 [US1] In `functions/src/generators.ts` `generateBuildPlan()` (~L4370, universe context ~L4442–4467), inject `buildBlueprintMetaphorVisualBlock(resolvedUniverse)` ONLY when the decision is `applied:true` (fantasy + not suppressed). Place it subordinate to the existing `UNIVERSE LOGIC & COSTUME RULES` / identity rules so it cannot override them (FR-014: do not alter `buildFinalImagePrompt` structure).
- [ ] T013 [US1] In `functions/src/generators.ts` `generateFinalAd()`, add the `universeAwareCopy` trace write next to the `expressionAdaptation` (~L5605) / `gazeDirection` (~L5658) writes, spreading the `UniverseCopyDecision` object (compute via the same `resolveUniverseCopyDecision(...)` call). Follow the identical `_lastResolutionTrace = { ...(_lastResolutionTrace||{}), universeAwareCopy: decision }` pattern.
- [ ] T014 [P] [US1] In `functions/src/__tests__/universeCopyMap.test.ts`, add **Contract B1** (relaxed block present / strict absent when `applied:true`) and **Contract C1** (blueprint visual instruction present when `applied:true`) — assert on the block-builder outputs / a fantasy-active decision.
- [ ] T015 [P] [US1] In the same test file, add **Contract D1** (fantasy single, no ref ad → trace `{applied:true, styleFamily:'fantasy', reason:'fantasy-universe-metaphor-active'}`).
- [ ] T016 [US1] Run `cd functions; npm run build; npm test` and confirm green. Then `npm run dev` (repo root): generate a single fantasy ad with a hook, confirm copy reads with at most one subtle metaphor and trace shows `applied:true` (quickstart § 2 step 2).

**Checkpoint**: US1 fully works and is independently testable — this is the shippable MVP. The generateTOV/blueprint/trace wiring established here is reused (unchanged) by every later story.

---

## Phase 4: User Story 2 — Realistic & minimal stay strictly literal (Priority: P1)

**Goal**: Realistic/minimal/unknown families emit the UNCHANGED strict rule and record `applied:false`. No code beyond what Phase 2–3 produced — this phase PROVES the safety contract.

**Independent Test**: Generate realistic and minimal ads → strict rule emitted (byte-identical to today), no universe vocabulary, trace `applied:false` with the literal reason.

- [ ] T017 [P] [US2] In `functions/src/__tests__/universeCopyMap.test.ts`, add **Contract B2** (strict block present / relaxed absent when `applied:false`) and **Contract C2** (blueprint visual instruction ABSENT when `applied:false`).
- [ ] T018 [P] [US2] In the same file, add **Contract D2** (realistic → `realistic-no-metaphor`), **D3** (minimal → `minimal-no-metaphor`), and **A10** coverage (unknown family resolves to realistic → `realistic-no-metaphor`).
- [ ] T019 [US2] On `npm run dev`, generate one realistic and one minimal ad; confirm copy is literal/unchanged and traces read `applied:false` with the correct reason (quickstart § 2 steps 3–4). Manually diff a realistic copy prompt against pre-change behavior to confirm the strict text is byte-identical (Constitution II/III regression guard).

**Checkpoint**: Literal path provably unchanged.

---

## Phase 5: User Story 3 — Reference ad suppresses the metaphor (Priority: P2)

**Goal**: A reference ad suppresses the metaphor regardless of family; trace records `reference-ad-override`.

**Independent Test**: Fantasy ad + reference ad → no relaxed block, no blueprint instruction, trace `{applied:false, styleFamily:'fantasy', reason:'reference-ad-override'}`.

- [ ] T020 [US3] In `functions/src/generators.ts`, confirm the canonical reference-ad presence signal used by all three call sites (T010/T012/T013) is consistent — prefer the resolver flag `referenceAdOverrideActive` if available at that scope (~L5678), else the `!!(inputs as any).referenceAd` check (used at L323/L958). Ensure `referenceAdPresent` is wired identically into every `resolveUniverseCopyDecision(...)` call so copy, blueprint, and trace agree.
- [ ] T021 [P] [US3] In `functions/src/__tests__/universeCopyMap.test.ts`, add **Contract D4 / A4 / A5 / A8** (reference ad present, fantasy and realistic, including ref-ad + carousel precedence → always `reference-ad-override`).

**Checkpoint**: Reference-ad override holds and is traced.

---

## Phase 6: User Story 4 — Carousel applies metaphor only on the hook slide (Priority: P2)

**Goal**: Carousel slide 1 may carry the metaphor; slides 2+ stay literal and record `carousel-non-hook-slide`.

**Independent Test**: Fantasy carousel → slide 1 trace `fantasy-universe-metaphor-active`; slides 2+ trace `carousel-non-hook-slide` and no blueprint visual instruction.

- [ ] T022 [US4] In `functions/src/generators.ts`, VERIFY (per plan § "Carousel nuance") the exact slide-index variable in scope at the `generateBuildPlan()` blueprint injection site and at the `generateFinalAd()` trace site — `carouselSlideIndex` (~L5686/L5691, hook slide = 0). Determine whether the carousel trace is per-slide (`ResolutionTrace.perSlide`, ~types.ts L5160) or per-generation, and record the finding in the scratch note.
- [ ] T023 [US4] Wire `isCarouselNonHookSlide = (inputs.adMode === 'carousel' && (carouselSlideIndex ?? 0) > 0)` into the blueprint-injection decision (T012 site) and the trace-write decision (T013 site), so slides 2+ suppress the visual instruction AND record `carousel-non-hook-slide`. Hook slide (index 0) keeps the family-driven reason. Non-carousel (single/batch) passes `false` (FR-010 — batch needs no special logic).
- [ ] T024 [P] [US4] In `functions/src/__tests__/universeCopyMap.test.ts`, add **Contract D6** (carousel hook slide idx 0 → `fantasy-universe-metaphor-active`), **D7** (slide idx>0 → `carousel-non-hook-slide`), and **A7 / A9** (slide-suppression + text-only precedence).
- [ ] T025 [US4] On `npm run dev`, generate a fantasy carousel; confirm slide 1 vs slides 2+ traces match (quickstart § 2 step 7).

**Checkpoint**: Carousel hook-slide-only behavior holds.

---

## Phase 7: User Story 5 — Text-only mode never adds a metaphor (Priority: P3)

**Goal**: Text-only suppresses the metaphor regardless of family; trace records `text-only-mode`.

**Independent Test**: Text-only fantasy ad → no relaxed block, trace `reason:'text-only-mode'`.

- [ ] T026 [US5] In `functions/src/generators.ts`, confirm `isTextOnly = isTextOnlyMode(inputs)` (L562) is wired into every `resolveUniverseCopyDecision(...)` call (copy/blueprint/trace) so text-only suppression is consistent. (Decision precedence already places text-only above family.)
- [ ] T027 [P] [US5] In `functions/src/__tests__/universeCopyMap.test.ts`, add **Contract D5 / A6** (text-only + fantasy → `text-only-mode`). On `npm run dev`, generate a text-only fantasy ad and confirm the trace (quickstart § 2 step 6).

**Checkpoint**: Text-only no-op holds.

---

## Phase 8: User Story 6 — Custom (user-typed) fantasy universe works (Priority: P3)

**Goal**: A custom fantasy universe draws metaphor vocabulary from the user's text.

**Independent Test**: Custom fantasy universe → relaxed block uses the custom text; trace `applied:true, styleFamily:'fantasy'`.

- [ ] T028 [US6] In `functions/src/universeCopyMap.ts`, confirm `buildFantasyMetaphorCopyBlock` (T007) prefers `customUniverseDetails` over `resolvedUniverse` when present, matching the existing "CUSTOM UNIVERSE (TOP PRIORITY)" precedence at `generators.ts` L1875–1877. Confirm the T010 call passes `inputs.customUniverseDetails` through.
- [ ] T029 [P] [US6] In `functions/src/__tests__/universeCopyMap.test.ts`, add a test asserting `buildFantasyMetaphorCopyBlock('X', 'my custom realm')` includes the custom text (and a fantasy decision still yields `applied:true`). On `npm run dev`, generate with a custom fantasy universe and confirm (quickstart § 2 step 8).

**Checkpoint**: Custom fantasy universes covered.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification + the hardened delivery gate.

- [ ] T030 Run the full backend suite: `cd functions; npm run build; npm test`. ALL contracts (A–E across all stories) green. Also `npm run lint` (repo root) clean for touched files.
- [ ] T031 [P] Reversibility check (FR-016 / Contract E): confirm both strict originals remain as comments at the two `generateTOV` sites and that neutralizing the mapper (strict-for-all) would restore byte-identical prompts; note this in the PR description.
- [ ] T032 [P] Confirm NON-changes (FR-014/FR-015 + NFR-001..004): no edits to gaze (Phase 19) / expression (Phase 28) blocks, no `buildFinalImagePrompt` structural change, no `validateCopyFidelity` change, no frontend file, no new callable, no Firestore migration. `git diff --stat` should touch only `functions/src/universeCopyMap.ts`, `functions/src/generators.ts`, `functions/src/types.ts`, `functions/src/__tests__/universeCopyMap.test.ts`, `functions/package.json`, and docs.
- [ ] T033 [P] Update `docs/LAUNCH_MATRIX.md` Phase 27 section: mark status, and correct the stale "subheadline or benefit (not headline)" note to "Gemini's choice across headline/subheadline/CTA/benefit" (per spec Assumptions / founder decision).
- [ ] T034 Execute the hardened gate end-to-end: implement → build → test → commit → push → PR → CodeRabbit (fix ALL comments) → Claude audit → `npm run dev` localhost QA (all quickstart § 2 scenarios) → merge via GitHub UI → deploy functions → production test (quickstart § 3).

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2)** → depends on Setup. **BLOCKS all user stories.** (T003 type, T004–T008 mapper, T009 Contract A/E tests.)
- **US1 (Phase 3)** → depends on Foundational. **This is the MVP.** Establishes the generateTOV/blueprint/trace wiring reused by all later stories.
- **US2 (Phase 4)** → depends on US1 wiring (proves the strict path through the same code). Mostly tests.
- **US3 (Phase 5)** → depends on US1 (reference-ad signal into existing call sites).
- **US4 (Phase 6)** → depends on US1 (carousel slide signal into existing blueprint/trace sites). Only story with non-trivial new wiring (T022/T023).
- **US5 (Phase 7)** → depends on US1 (text-only signal — likely already wired in T010/T013; this phase verifies + tests).
- **US6 (Phase 8)** → depends on US1 + T007 (custom-text preference).
- **Polish (Phase 9)** → depends on all stories.

**Story independence**: US2–US6 each verify a distinct input combination through the shared decision function and the US1 wiring; their decision logic is already proven in Foundational (Contract A). They can be tested independently and in any order after US1.

## Parallel Opportunities

- Phase 1: T002 ∥ T001.
- Phase 2: T004→T005→T006/T007/T008 are sequential within one file (`universeCopyMap.ts`) so NOT parallel with each other; T003 (`types.ts`) ∥ the mapper work.
- Within stories, test-authoring tasks marked **[P]** (T014, T015, T017, T018, T021, T024, T027, T029) touch only the test file and can be written in parallel with each other once their story's wiring exists — but they all share one file, so coordinate edits (treat [P] as "no logic dependency", commit-serialize the file).
- Polish: T031, T032, T033 are independent [P]; T030 and T034 are gates (sequential).

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone delivers the feature's core value (fantasy metaphor + coherent visual + audit trace) and is independently shippable. Layer US2 (safety proof) immediately after — it is co-P1 and protects the dominant literal path. US3–US6 are incremental guards, each a thin wiring/test increment on the US1 foundation. Ship behind the existing gate order (T034); the feature is fully reversible at every step.
