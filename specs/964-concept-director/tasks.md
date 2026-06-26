# Tasks: Phase 20 — Concept Director (Option A, backend-only)

**Input**: Design documents from `/specs/964-concept-director/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (Director / Validator / Integration / Trace), quickstart.md

**Tests**: INCLUDED — the spec requests them (FR-027 / FR-028, LAUNCH_MATRIX 20.G) and Constitution Principle IX (Proof) mandates them. Tests are unit tests on the pure modules via `node:test`, plus source-scan assertions for injection/trace sites (mirrors `gazeMap.test.ts` / `expressionMap.test.ts`).

**Organization**: Phases by user story (P1 → P2). All paths absolute-relative to repo root `functions/`. This is a backend-only feature; no frontend file is touched.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)

## Implementer notes (read first)

- The two new modules `functions/src/conceptDirector.ts` and `functions/src/varianceValidator.ts` MUST be **pure** — no imports from `firebase-admin`, `firebase-functions`, or the Gemini SDK. The model call enters `directConcept` as an injected `callModel` function (see Contract A). This mirrors `gazeMap.ts` / `expressionMap.ts`.
- Today `generateConcepts()` emits all 3 concepts in **one** Gemini call. The Director does NOT change that — it produces 3 briefs first and injects them as 3 labeled directives into that one prompt. Do not split the existing single render call.
- Everything is additive and fail-open. When briefs are absent, `generateConcepts()` must behave **byte-for-byte** as today.
- Reference contracts by ID (A1–A10, B1–B8, C1–C7, D1–D4) and data-model §1–7 when implementing each task.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Register the test target so the suite picks up new tests.

- [ ] T001 Append `&& node lib/__tests__/conceptDirector.test.js` to the `test` script in `functions/package.json` (so the new test file runs in the existing `npm test` chain, after `gazeMap`/`universeCopyMap`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema + trace type every story depends on. **No story work begins until this phase is complete.**

- [ ] T002 Create `functions/src/conceptDirector.ts` with the pure-module header banner and the schema from data-model §1–4: `VarianceMode`, the 7 closed enum unions (`HeadlineArchitecture`, `LayoutArchetype`, `HeroGazeDirection`, `HeroPresence`, `BackgroundComplexity`, `LogoTreatment`), and the interfaces `ConceptBrief`, `ConceptDirectorInput`, `ConceptDirectorFallback`. No logic yet. No Firebase/Gemini imports.
- [ ] T003 [P] Create `functions/src/varianceValidator.ts` with the pure-module header banner and the types from data-model §5: `ViolationSeverity`, `VarianceAxis`, `VarianceViolation`, `VarianceValidationResult`. No logic yet. No Firebase/Gemini imports.
- [ ] T004 [P] Add the optional, additive `conceptDirector?` sub-object to `ResolutionTrace` in `functions/src/types.ts` exactly per Contract D1 (with the documenting comment, following the `expressionAdaptation` / `gazeDirection` precedent). No existing field changes shape.

**Checkpoint**: `cd functions && npm run build` compiles with the new types present and unused.

---

## Phase 3: User Story 1 — Three concepts that actually look different (Priority: P1) 🎯 MVP

**Goal**: The Director authors three deliberately distinct, enriched briefs and the existing concept prompt consumes them, so the three concept cards diverge on metaphor / layout / headline.

**Independent Test**: Unit tests show 3 balanced-mode briefs with distinct `metaphorToken`, ≥3 `propsForbidden`, correct `subStyleSpecialization.inheritedFrom`, and a valid `heroGazeDirection`; `buildConceptEnrichmentBlock` emits 3 labeled directives.

### Tests for User Story 1 (write first — expect FAIL before T006–T009)

- [ ] T005 [P] [US1] Create `functions/src/__tests__/conceptDirector.test.ts` and add US1 cases (FR-027 a/b/c/e): (a) three sample balanced briefs have distinct `metaphorToken`; (b) every brief `propsForbidden.length ≥ 3`; (c) `subStyleSpecialization.inheritedFrom` equals the input subStyle exactly; (e) `heroGazeDirection` is one of the 5 allowed enum values; plus a `validateBrief` pass case and a `buildConceptEnrichmentBlock` 3-slot output assertion. **Hero-less case (Edge Case coverage, G1):** a brief with `heroPresence:"absent"` passes `validateBrief` and its `buildConceptEnrichmentBlock` slot omits hero gaze/pose directives. **pastWinningAds default (FR-007, U1):** building a `ConceptDirectorInput` with `pastWinningAds` undefined resolves it to `[]` (assert the normalized input, and that `directConcept` runs unaffected with no past ads).

### Implementation for User Story 1

- [ ] T006 [US1] Implement `buildDirectorPrompt(input)` in `functions/src/conceptDirector.ts` per Contract A2–A5 and LAUNCH_MATRIX 20.B.3: 7-step reasoning, concrete depictable `visualMetaphor.description`, free-text fields in `input.inviolable.language` but enum labels in English, include each prior sibling's `varianceAxes` + `avoidTokens` with an instruction to differ, forbid overriding inviolable choices, require `subStyleSpecialization.inheritedFrom === input.inviolable.subStyle`. JSON-only output instruction.
- [ ] T007 [US1] Implement `parseDirectorResponse(raw)` and `validateBrief(brief, expectedSubStyle)` in `functions/src/conceptDirector.ts` per Contract A6 / data-model §3: enforce `highlightCardinality.count ≤ 2`, `propsForbidden.length ≥ 3`, `restraintRules.length ≥ 2`, `inheritedFrom === expectedSubStyle`, every enum within set, all three `varianceAxes` tokens present and non-empty; return `{ ok, reason }`.
- [ ] T008 [US1] Implement `directConcept(input, callModel, timeoutMs=15000)` **happy path** in `functions/src/conceptDirector.ts` (Contract A1): build prompt → `callModel` → parse → `validateBrief` → return `ConceptBrief`. (Failure/fallback branches are added in US2 — leave a clear TODO marker.)
- [ ] T009 [US1] Implement `buildConceptEnrichmentBlock(briefs)` in `functions/src/conceptDirector.ts` (Contract A9): for each of 3 slots, emit a labeled `CONCEPT N` directive (metaphor / headline architecture / layout / forbidden props / hero gaze+pose / restraint) for an accepted brief, or a "use existing logic for CONCEPT N" marker for a fallback slot. **Note (G1):** a slot whose brief has `heroPresence:"absent"` (and any fallback slot) MUST omit the hero gaze/pose directives — there is no hero to direct, so emitting gaze/pose would fight the hero-less mode.
- [ ] T010 [US1] Add an optional `conceptDirectorBriefs?` parameter to `generateConcepts(...)` in `functions/src/generators.ts` and inject `buildConceptEnrichmentBlock(...)` output into the `[VISUAL ARCHITECT V5.0]` prompt at the concept-architecting point (Contract C5.1–C5.3). When the parameter is absent, the prompt is byte-for-byte unchanged. Existing positive-layout / anti-robotic / costume / contrast / universe / mode rules remain and outrank the enrichment.
- [ ] T011 [US1] Make `quickRejectCheck` and `validateBlueprintMinimalStyle` headline-architecture-aware in `functions/src/generators.ts` (Contract C5.4 / FR-019): whitelist novel architectures (manifesto, oversized_question, numerical_anchor, ellipsis_tease, etc.) so they are not rejected as "broken"; keep genuine malformed-output checks.
- [ ] T012 [US1] In `serverGenerateConcepts` (`functions/src/index.ts`), add the **3× sequential** Director loop for `mode === 'initial'` (still ungated — the flag/kill-switch gate is added in US4): build a `ConceptDirectorInput` per `conceptIndex` 0→1→2 passing the accepted siblings so far, wrap the already-set Gemini caller as `callModel`, collect the 3 results, and pass them into `generateConcepts(...)` (Contract C3.1–C3.2).

**Checkpoint**: US1 unit tests pass; a flag-less `initial` generation produces 3 enriched, distinct concepts; build is green.

---

## Phase 4: User Story 2 — Never block, never break (fail-open safety) (Priority: P1)

**Goal**: Any Director failure (error / >15s timeout / malformed / schema / hard-rule) falls back to existing logic for that concept only, with no user-facing error and unchanged credits.

**Independent Test**: Unit tests force each failure mode and assert `{ fallback: true, reason }`; a one-concept fallback still yields two enriched siblings; all-three fallback matches flag-off output.

### Tests for User Story 2 (write first — expect FAIL before T014)

- [ ] T013 [P] [US2] Add US2 cases to `functions/src/__tests__/conceptDirector.test.ts` (FR-027 d/f): simulated `callModel` rejection → `{ fallback:true, reason:"api_error" }`; a `callModel` that never resolves within `timeoutMs` → `{ fallback:true, reason:"timeout_15s" }` (use a short injected timeout in the test); unparseable output → fallback; a hard-constraint-violating brief (e.g. 2 forbidden props) → fallback; and a 3-result array with one fallback where the other two remain valid `ConceptBrief`s. Assert `directConcept` never throws.

### Implementation for User Story 2

- [ ] T014 [US2] Complete the fallback branches of `directConcept` in `functions/src/conceptDirector.ts` (Contract A7/A8): wrap in try/catch, race the `callModel` promise against `timeoutMs` (default 15000), and return a typed `ConceptDirectorFallback` with the correct `reason` on model error, timeout, JSON parse failure, schema mismatch, or `validateBrief` failure. The function MUST NEVER throw.
- [ ] T015 [US2] Ensure loop isolation in `serverGenerateConcepts` (`functions/src/index.ts`, Contract C3.3): a fallback for one concept does not abort the loop; the mixed `(ConceptBrief | ConceptDirectorFallback)[]` array is passed onward; fallback slots flow through `buildConceptEnrichmentBlock` as "use existing logic" markers.
- [ ] T016 [US2] Verify (and add a one-line guard/comment if needed) that the Director path adds **no** new credit deduction or refund and never converts a successful generation into a user-facing failure in `functions/src/index.ts` (Contract C6 / FR-011): the existing failure-classification + refund path is untouched.

**Checkpoint**: forcing failures still ships a normal result; US1 + US2 unit tests green.

---

## Phase 5: User Story 3 — Catch and fix accidental sameness (Validator + retry) (Priority: P2)

**Goal**: A deterministic, no-AI validator detects core-axis collisions and triggers at most one retry of the offending concept(s), shipping as-is if the retry still collides.

**Independent Test**: Validator unit tests cover the balanced decision table; retry orchestration tests show exactly one retry then ship-as-is.

### Tests for User Story 3 (write first — expect FAIL before T018–T019)

- [ ] T017 [P] [US3] Add validator cases to `functions/src/__tests__/conceptDirector.test.ts` (FR-028): balanced mode blocks when `metaphorToken` matches in 2 of 3; blocks when `layoutToken` identical across all 3; passes a non-duplicating set with no violation; `normalizeToken` makes case/space-different tokens compare equal; a fallback slot is excluded from comparison (B5); and an orchestration-level case asserting a duplicate triggers exactly one retry and a still-failing retry ships as-is with `varianceAchieved:false`.

### Implementation for User Story 3

- [ ] T018 [P] [US3] Implement `normalizeToken(token)` and `validateBatchVariance(briefs, varianceMode)` in `functions/src/varianceValidator.ts` per Contract B1–B8: normalized exact match; balanced rules (metaphor ≥2-of-3, layout all-3, headline all-3); fallback slots skipped; `warn` never flips `passed`; return `{ passed, violations[] }` with `duplicateConceptIndices`. (Define `conservative`/`aggressive` rule branches for forward-compat but they are not exercised live.)
- [ ] T019 [US3] Add validate + retry orchestration after the loop in `serverGenerateConcepts` (`functions/src/index.ts`, Contract C4 / FR-015/016): call `validateBatchVariance(results, 'balanced')`; on a `block` violation and no prior retry for an offending concept, re-run `directConcept` for that concept with the duplicated tokens added to `avoidTokens` and a per-concept "retried" guard; re-validate once; if still failing, ship as-is. Max 1 retry per concept; never block or error.

**Checkpoint**: validator + retry unit tests green; SC-005 (never >1 retry) holds.

---

## Phase 6: User Story 4 — Safe, reversible rollout (flag + kill switch) (Priority: P2)

**Goal**: The whole stage runs only for flagged users on the single-ad initial flow, is globally disablable within 60s via Remote Config, and records an additive audit trace.

**Independent Test**: Flag-off skips the stage (output unchanged); kill-switch-on skips for everyone; trace records `ran` + `reason` in both branches.

### Tests for User Story 4 (write first — expect FAIL before T021–T023)

- [ ] T020 [P] [US4] Add US4 cases to `functions/src/__tests__/conceptDirector.test.ts` and a small `types.ts` shape check: a sample `ran:true` trace object and a sample `ran:false` (`reason:"flag-disabled"`) trace object both satisfy the `ResolutionTrace.conceptDirector` type; and a source-scan assertion (readFileSync on `index.ts`) confirming the trace is written in both the ran and skipped branches and that the gate checks `mode==='initial'`, the flag, and the kill switch (mirrors `gazeMap.test.ts` source-scan style).

### Implementation for User Story 4

- [ ] T021 [US4] Implement the flag + kill-switch reads (Contract C2 / D4): per-user `users/{uid}.conceptDirectorEnabled` (absent/non-boolean → `false`), and the kill switch `conceptDirectorKillSwitch`. **PINNED MECHANISM (D1):** the kill switch MUST use **Firebase Remote Config via the Admin SDK server template** (`getRemoteConfig().getServerTemplate()`), evaluated at generation start, with a **60s in-process cache** that serves last-known-good on read error. Do NOT implement the Firestore-config-doc alternative — it is a documented fallback in research.md §D4 only, to be revisited solely if Remote Config server-template wiring is blocked (a change of mechanism would require a one-line spec/plan update first). Placement of the read logic in a small helper `functions/src/conceptDirectorConfig.ts` vs inline in `index.ts` is free (keep `conceptDirector.ts`/`varianceValidator.ts` pure either way).
- [ ] T022 [US4] Add the run/skip **gate** in `serverGenerateConcepts` (`functions/src/index.ts`, Contract C1 / FR-021–024): the stage runs iff `mode==='initial'` AND single-ad flow AND flag on AND kill switch off; the decision is computed **once** and held; when skipped, `generateConcepts` runs exactly as today and no Director call is made. Wraps the US1–US3 loop.
- [ ] T023 [US4] Write `resolutionTrace.conceptDirector` in the concepts flow for **both** branches (Contract D2): on run, record `ran:true`, `enabled`, `killSwitch`, `mode:'balanced'`, `conceptCount`, `fallbackCount`, `validatorTriggered`, `retryCount`, `varianceAchieved`; on skip, record `ran:false` with `reason` ∈ {`flag-disabled`, `kill-switch-on`, `non-initial-mode`, `not-single-ad-flow`}. Additive; legacy generations may omit it.

**Checkpoint**: flag-off regression matches today; kill switch disables globally; trace present on both paths; all unit tests green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Purity check: confirm `functions/src/conceptDirector.ts` and `functions/src/varianceValidator.ts` import nothing from `firebase-admin`, `firebase-functions`, or the Gemini SDK (quickstart §H).
- [ ] T025 Run `cd functions; npm run build` — zero TypeScript errors — then `npm test` — the full suite including `conceptDirector.test.js` is green.
- [ ] T026 Execute the `quickstart.md` manual validation checklist end-to-end against the local/dev environment: flag-off regression (§B), flag-on happy path (§C), fail-open paths (§D), variance retry (§E), kill switch ≤60s (§F), scope boundaries — carousel/batch/refresh/edit do NOT run the stage (§G), and audit/constitution checks (§H).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: independent — can run anytime.
- **Foundational (T002–T004)**: T003, T004 are `[P]` (different files); T002 creates the shared schema. **Blocks all stories.**
- **US1 (T005–T012)**: depends on T002. MVP.
- **US2 (T013–T016)**: depends on US1 (extends `directConcept` from T008 and the loop from T012).
- **US3 (T017–T019)**: depends on Foundational T003 + the US1 loop (T012). T018 is `[P]` (own file); T019 extends the loop.
- **US4 (T020–T023)**: depends on the US1 loop (T012) and trace type (T004); wraps US1–US3.
- **Polish (T024–T026)**: after all desired stories.

### Within stories (same-file ⇒ sequential)

- `conceptDirector.ts`: T006 → T007 → T008 → T009 (same file). T014 extends T008.
- `generators.ts`: T010 → T011 (same file).
- `index.ts`: T012 → T015 → T019 → T022 → T023 (same file — keep this order).

### Parallel opportunities

- T003 and T004 together (Foundational, different files).
- Test-authoring tasks T005, T013, T017, T020 each touch the same test file — author sequentially OR write as one growing file per phase; they are marked `[P]` only relative to non-test implementation in other files.
- T018 (`varianceValidator.ts`) can be implemented in parallel with `index.ts`/`generators.ts` work since it is a separate file.

---

## Parallel Example: Foundational

```bash
# After T002 establishes the schema file, T003 and T004 are independent:
Task: "Create varianceValidator.ts types (T003)"
Task: "Add ResolutionTrace.conceptDirector type in types.ts (T004)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Setup (T001) → Foundational (T002–T004).
2. US1 (T005–T012): pure Director happy-path + enrichment + ungated loop.
3. **STOP & VALIDATE**: run US1 unit tests; eyeball 3 concepts for real divergence on a test brief.
4. This is demonstrable value even before fail-open hardening.

### Incremental hardening

5. US2 (fail-open) — makes it safe for the live path.
6. US3 (validator + retry) — raises the variety ceiling.
7. US4 (flag + kill switch + trace) — makes rollout reversible and auditable. **Required before enabling for any real user.**
8. Polish (T024–T026) — purity, build, full quickstart.

### Ship gate (hardened order)

implement → `npm run build` → `npm test` → commit → push → PR → CodeRabbit → Claude audit → `npm run dev` smoke → merge via GitHub UI → deploy → production test (flag on for one test user → widen → kill switch ready).

> **Do not enable the per-user flag for any real user until US2 + US4 are complete** (fail-open + kill switch must exist before live exposure).
