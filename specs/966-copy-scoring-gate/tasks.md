---

description: "Task list for Phase 22 — Copy Quality Upgrade (Silent Scoring & Rewrite Gate)"
---

# Tasks: Phase 22 — Copy Quality Upgrade (Silent Scoring & Rewrite Gate)

**Input**: Design documents from `/specs/966-copy-scoring-gate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/copy-scoring-gate.md, quickstart.md

**Tests**: INCLUDED. Constitution Principle IX (reproducible proof) and Principle IV (behavior contracts) require them, and research R8 specifies the approach: string/parser assertions with stubbed clients, no live model calls — the pattern used by `culturalCompliance.test.ts` and `gazeMap.test.ts`.

**Organization**: Grouped by user story. All work lands in `functions/src/` except two opaque passthrough edits in `src/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (maps to spec.md user stories)

## Path Conventions

Backend Firebase Functions, plus a minimal frontend passthrough:

- Gate module: `functions/src/copyScoringGate.ts`
- Kill switch: `functions/src/modelConfig.ts`
- Rubric constants: `functions/src/copywriting_knowledge.ts`
- Attach points + trace type: `functions/src/generators.ts`
- Trace type: `functions/src/types.ts`
- Callables: `functions/src/index.ts`
- Tests: `functions/src/__tests__/copyScoringGate.test.ts`
- Frontend passthrough: `src/types.ts`, `src/App.tsx`

## ⚠️ Read before starting

**Do not use a module-global survivor to carry the trace between callables.** `serverGenerateTOV` and `serverGenerateFinalAd` run in separate Cloud Run containers. `generators.ts:1389-1398` documents that this pattern "worked in the emulator (shared process) but **NEVER in production**." It passes every local test and writes `undefined` in production. See research R1 and Contract I2.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the feature inert-by-default and register its test surface before any behavior exists.

- [x] T001 Add `COPY_SCORING_ENABLED: boolean = true` to `functions/src/modelConfig.ts`, placed directly beside `MODEL_PROVIDER` with a comment marking it the permanent kill switch and one-line reversal for Phase 22 (FR-019c, FR-019e, research R7)
- [x] T002 [P] Create the empty test file `functions/src/__tests__/copyScoringGate.test.ts` with the runner scaffold used by `functions/src/__tests__/culturalCompliance.test.ts` (assert counter, pass/fail reporting, non-zero exit on failure)
- [x] T003 [P] Register the new test in the `test` script chain in `functions/package.json`, immediately after `copyQuality.test.js`, and add a `test:copyScoringGate` convenience script
- [x] T004 [P] Annotate `COPY_SCORING_DIMENSIONS` and `COPY_REWRITE_DIAGNOSES` in `functions/src/copywriting_knowledge.ts` to mark which 9 dimensions are active in this phase and which 6 are deferred to Phase 23 — add comment lines only, do NOT rewrite the rule text (FR-002a, preserves Track-1 drift-control discipline)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, the never-throws safety boundary, and credential wiring. Nothing calls a model yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Define `CopyDimension` union (exactly the 9 active dimensions), `ScoredField`, `RewriteDecision`, and `CopySet` interfaces in a new `functions/src/copyScoringGate.ts` per data-model.md §1 — no Firebase imports, no `admin.firestore()` at module top level
- [x] T006 Add the optional `copyScoring` sub-object to `ResolutionTrace` in `functions/src/types.ts` (line ~353) per data-model.md §2
- [x] T007 Add the identical optional `copyScoring` sub-object to `ResolutionTrace` in `functions/src/generators.ts` (line ~5475) — **both definitions are required**; adding to one only is a silent-write hazard (research R9, Contract I3)
- [x] T008 Implement the `gateCopySet` signature shell in `functions/src/copyScoringGate.ts` with injected `score` / `rewrite` / `now` dependencies, returning `{ block: rawBlock, trace: { ran: false, skipReason: "disabled" } }` unconditionally (Contract A2)
- [x] T009 Wrap `gateCopySet` in a total-isolation boundary so it can never throw or reject — every path resolves to `{ block, trace }`, and on any failure `block` is the input `rawBlock` byte-for-byte (Contract A1, FR-015). This is the precondition for attaching to a credit-consuming path at all.
- [x] T010 [P] Add `openaiApiKey` to the `secrets` array of `serverGenerateTOV` in `functions/src/index.ts` (line ~4206), keeping `geminiApiKey` and `region: "europe-west1"` (research R2)
- [x] T011 [P] Add `openaiApiKey` to the `secrets` array of `serverGenerateCarouselSlideCopies` in `functions/src/index.ts` (line ~5163)
- [x] T012 [P] Add `openaiApiKey` to the `secrets` array of `serverGenerateTestimonialCarousel` in `functions/src/index.ts` (line ~5197)
- [x] T013 [P] Write foundational tests in `functions/src/__tests__/copyScoringGate.test.ts` asserting Contract A1 (never throws under a throwing stub, a rejecting stub, and a stub returning `undefined`) and Contract A3 (switch off performs zero model interactions)

**Checkpoint**: The gate exists, is inert, and is provably incapable of failing a generation. User story work can begin.

---

## Phase 3: User Story 1 - Below-threshold copy is silently improved (Priority: P1) 🎯 MVP

**Goal**: Generated copy that reads above a 6th-grade level or states an abstract problem is silently rewritten into plain, concrete language before the advertiser ever sees it.

**Independent Test**: Generate ads across several offers in both languages with `COPY_SCORING_ENABLED` on and off. With the gate on, sampled copy reads at or below 6th grade and names a concrete lived moment at a materially higher rate. No score, badge, or control appears anywhere in the product.

### Tests for User Story 1

> Write these first and confirm they fail before implementing.

- [x] T014 [P] [US1] Scoring tests in `functions/src/__tests__/copyScoringGate.test.ts` — Contract B1–B6: exactly 9 dimensions; a response naming any deferred dimension is rejected as malformed; absent optional fields skipped; untouchable entries never scored; non-integer and out-of-range values rejected; one interaction covers every field of every variation
- [x] T015 [P] [US1] Threshold tests — Contract C1–C4: each failure condition in isolation; a CTA scoring 2 on `livedSymptomDepth` and at threshold elsewhere **passes**; CTA/benefit average over 8 dimensions while all other fields average over 9
- [x] T016 [P] [US1] Rewrite tests — Contract D1–D5, D9–D10: one call handles many failing fields; each carries its own diagnosis; passing fields absent from the payload and returned unchanged; a lower-scoring rewrite discarded with `rejectReason: "scored_lower"`; a rewrite failing a length cap or cultural check rejected in favour of the original
- [x] T017 [P] [US1] Claim-flag tests — Contract D6–D8: a stale flag on a rewritten field is cleared; a specific newly invented by a rewrite is flagged; flags on untouched fields carry through unchanged; re-evaluation consumes no additional interaction
- [x] T018 [P] [US1] Block-integrity tests — Contract E1–E4: markers, labels, and claim-flag lines preserved; a rewrite dropping a variation rejected; an unparseable rewritten block rejected; any untouchable-text mutation rejected with `rejectReason: "untouchable_mutated"`

### Implementation for User Story 1

- [x] T019 [US1] Implement the scoring client in `functions/src/copyScoringGate.ts` using the `openai` SDK in JSON mode — accepts every present field of every variation, returns per-field per-dimension integer scores, rejects any response naming a deferred dimension (FR-002, FR-002a, FR-018b, research R5)
- [x] T020 [US1] Implement per-field threshold evaluation in `functions/src/copyScoringGate.ts`: average < 8, OR `readingLevel` < 7, OR any of the other 7 < 6 (FR-006, Contract C1–C2)
- [x] T021 [US1] Implement the lived-symptom field scoping in `functions/src/copyScoringGate.ts` — gates only headline, subheadline, and slide captions; on CTA and benefit it is scored and recorded but never gates and is excluded from that field's average (FR-003a, FR-003b, Contract C3–C4)
- [x] T022 [US1] Implement the rewrite client in `functions/src/copyScoringGate.ts` — one interaction per pass covering all failing fields across all variations, each with its own diagnosis drawn from `COPY_REWRITE_DIAGNOSES` (FR-007, FR-018a, Contract D1–D3)
- [x] T023 [US1] Implement best-of-candidate selection across the original and both rewrites in `functions/src/copyScoringGate.ts`; discard any rewrite scoring lower than what it replaced (FR-010, Contract D5)
- [x] T024 [US1] Implement untouchable-text protection in `functions/src/copyScoringGate.ts` — advertiser literals (CTA text, brand, offer, product names) present for context, never scored, never rewritten, byte-identical on output (FR-011, Contract B3, E4)
- [x] T025 [US1] Implement claim-flag re-emission in `functions/src/copyScoringGate.ts` — the rewrite interaction re-emits flags for the fields it changed; flags on untouched fields carry through; no extra interaction consumed (FR-011a, FR-011b, FR-011c)
- [x] T026 [US1] Apply the existing cultural substitution rules from `functions/src/culturalCompliance.ts` to rewrite candidates before acceptance, so gated copy is already compliant at review time (FR-012a, Contract D9)
- [x] T027 [US1] Verify the existing post-approval cultural scan at `functions/src/generators.ts:5185-5209` and `:6230` is left completely unmodified as the safety net, and add a one-line comment noting it is expected to be a no-op for gated copy (FR-012b)
- [x] T028 [US1] Implement raw-block rewriting by **value substitution in place** in `functions/src/copyScoringGate.ts` — parse to fields, replace values, re-emit; never let the model regenerate the block scaffolding (FR-000b, Contract E1–E2, research R4)
- [x] T029 [US1] Implement the post-rewrite validation gate in `functions/src/copyScoringGate.ts` — re-parse the rewritten block with the existing extractor; reject and keep the original if variation count drops, a structural label is missing, the parse fails, or untouchable text changed (FR-000c, Contract E3–E4)
- [x] T030 [US1] Attach the gate to `generateTOV` in `functions/src/generators.ts` (line ~1904), behind `COPY_SCORING_ENABLED`, operating on the raw block before it returns (FR-000, FR-000d, Contract G1, G3)
- [x] T031 [US1] Guard the attach point so the gate does NOT run on the refresh, precision, or per-field edit paths — distinguish them by the existing `mode` and `rewriteScope` parameters of `generateTOV` (FR-019a, Contract G4). A miss here silently overwrites copy the advertiser deliberately asked for.
- [x] T032 [US1] Write a test asserting the refresh, precision, and per-field edit paths produce byte-identical output with the gate enabled and disabled (SC-005a, Contract G4)

**🎯 MVP Checkpoint**: Single, batch, and retargeting copy is gated — batch authors no copy of its own, so the hook attach point covers all three. Validate here before extending coverage.

- [x] T033 [US1] Attach the gate to `generateCarouselSlideCopies` in `functions/src/generators.ts` (line ~8723) as its **own** copy set with its own ceiling and budget; the approved hook block must pass through untouched (FR-000d, Contract G2). Add a test asserting the approved hook block is **byte-identical** before and after the slide step, confirming the gate never re-touches approved copy while still gating the newly authored captions (SC-006c)
- [x] T034 [US1] Attach the gate to `generateTestimonialCarousel` in `functions/src/generators.ts` (line ~9787), gating **only** the authored hook (line ~9823) and close (line ~9845) (FR-000e, Contract G3)
- [x] T035 [US1] Implement transcribed-testimonial protection in `functions/src/copyScoringGate.ts` — content transcribed from advertiser-supplied screenshots is untouchable and MUST never be scored or rewritten; altering it would fabricate a testimonial that was never given (FR-000f, Contract G5, SC-010)

**Checkpoint**: All three copy-producing steps gated. Copy quality improves silently across every format.

---

## Phase 4: User Story 2 - A failing gate never costs a generation (Priority: P1)

**Goal**: Every gate failure mode ships the original copy and completes the generation — no error, no lost credit, no retry.

**Independent Test**: Force the scoring service to time out, error, return malformed output, and return out-of-range scores. In every case the generation completes with the original copy, one credit is charged exactly as before, and no advertiser-visible error appears.

### Tests for User Story 2

- [x] T036 [P] [US2] Fail-open tests in `functions/src/__tests__/copyScoringGate.test.ts` for all ten research-R6 failure modes — unreachable, non-2xx, timeout at each of the three levels, unparseable JSON, out-of-range scores, missing credential, empty rewrite, dropped field, unparseable rewritten block, untouchable-text mutation — each asserting the original block ships with `ran: false` and the correct `skipReason`
- [x] T037 [P] [US2] Budget tests asserting each of the three `Promise.race` timeouts fires independently and abandons only its own scope (Contract F4)

### Implementation for User Story 2

- [x] T038 [US2] Implement the full `skipReason` taxonomy in `functions/src/copyScoringGate.ts` per data-model.md §2 — `disabled`, `no_credential`, `timeout_interaction`, `timeout_copyset`, `timeout_run`, `unreachable`, `malformed_response`, `out_of_range`, `unusable_rewrite`
- [x] T039 [US2] Implement the 8-second per-interaction budget in `functions/src/copyScoringGate.ts` via `Promise.race` against the injected `now` clock (FR-016)
- [x] T040 [US2] Implement the 20-second per-copy-set budget in `functions/src/copyScoringGate.ts` (FR-016)
- [x] T041 [US2] Implement the 60-second per-run budget spanning all copy-producing steps in `functions/src/copyScoringGate.ts` (FR-016, FR-016b)
- [x] T042 [US2] Implement partial-run semantics in `functions/src/copyScoringGate.ts` — when the run budget elapses mid-run, already-gated steps keep their improved copy, remaining steps ship originals, and the run succeeds (FR-016a, Contract F5)
- [x] T043 [US2] Implement response validation in `functions/src/copyScoringGate.ts` rejecting unparseable JSON, non-integer scores, out-of-range scores, missing fields, and empty rewrites — each mapping to its `skipReason` (FR-015, Contract B4)
- [x] T044 [US2] Handle a missing or unavailable `OPENAI_API_KEY` at each attach point in `functions/src/generators.ts` as `skipReason: "no_credential"` with the original copy proceeding (FR-015)
- [x] T045 [US2] Verify no gate path triggers a credit refund, a retry, or a generation failure — audit the `catch` blocks and `recordGenerationFailure` / `refundCreditsDirect` call sites around the three callables in `functions/src/index.ts` and confirm the gate is outside them (FR-017)
- [x] T046 [US2] Write a test asserting credit cost is identical with the gate enabled, disabled, and failing (SC-004)

**Checkpoint**: The gate is provably safe on a credit-consuming path. US1 + US2 together are shippable.

---

## Phase 5: User Story 3 - Rewriting is bounded and never loops (Priority: P2)

**Goal**: Hard-to-satisfy copy triggers at most two rewrite passes, then proceeds with the best candidate.

**Independent Test**: Feed inputs engineered so rewrites never reach threshold. Confirm exactly two rewrite passes occur, the best-scoring candidate proceeds, and the generation completes within its normal time envelope.

### Tests for User Story 3

- [x] T047 [P] [US3] Ceiling tests in `functions/src/__tests__/copyScoringGate.test.ts` — Contract F1: never more than 3 scoring + 2 rewrite interactions per copy set, regardless of field count, variation count, or failure count
- [x] T048 [P] [US3] Run-ceiling tests — Contract F2: no run exceeds 10 interactions; Contract F3: a maximum-size batch run makes the same number of interactions as a single-ad run (SC-005b)
- [x] T049 [P] [US3] Loop-termination test with a stub that never returns a passing score — asserts exactly 2 passes, `gaveUp: true`, and the best candidate proceeding

### Implementation for User Story 3

- [x] T050 [US3] Implement the 2-pass rewrite cap in `functions/src/copyScoringGate.ts` (FR-009, Contract D4)
- [x] T051 [US3] Implement the per-copy-set interaction counter enforcing the ceiling of 5 in `functions/src/copyScoringGate.ts` (FR-018, Contract F1)
- [x] T052 [US3] Implement the per-run interaction counter enforcing the ceiling of 10 across copy-producing steps in `functions/src/copyScoringGate.ts` — the ceiling must NOT scale with batch size or slide count (FR-019b, Contract F2–F3)
- [x] T053 [US3] Implement the `gaveUp` flag and best-candidate fallback in `functions/src/copyScoringGate.ts` for copy still below threshold after 2 passes (FR-009, US3 acceptance §2)
- [x] T054 [US3] Add a comment at the `generateTOV` attach point in `functions/src/generators.ts` recording that batch adds no copy-producing step — batch is N `generateFinalAd` calls over one approved TOV (`generators.ts:6132, 7520`), which is why the ceiling is step-based (research R3)

**Checkpoint**: Cost and latency are bounded by construction.

---

## Phase 6: User Story 4 - Every gate decision is auditable (Priority: P3)

**Goal**: The audit trail alone answers whether the gate ran, what it scored, what it changed, and why.

**Independent Test**: Run a batch of generations, then read the audit trail alone and reconstruct, for each one, whether the gate ran, what it scored, what it changed, and why.

### Tests for User Story 4

- [x] T055 [P] [US4] Trace-shape tests in `functions/src/__tests__/copyScoringGate.test.ts` — Contract I4: additive only; `ran: false` + `skipReason` distinguishable from `ran: true` with zero rewrites; switch-off writes only `{ ran: false, skipReason: "disabled" }` with no scores (FR-019f)
- [x] T056 [P] [US4] Test asserting a record with no `copyScoring` key remains readable and does not break the trace merge (FR-021)

### Implementation for User Story 4

- [x] T057 [US4] Assemble the per-step trace in `functions/src/copyScoringGate.ts` — per-field scores, rewrite decisions with diagnoses, `passCount`, `gaveUp`, `interactionCount` (FR-020, data-model.md §2)
- [x] T058 [US4] Return `copyScoringTrace` in the `serverGenerateTOV` response in `functions/src/index.ts` (line ~4231) — **over the HTTP boundary, not a module-global** (research R1, Contract I1–I2)
- [x] T059 [P] [US4] Return `copyScoringTrace` in the `serverGenerateCarouselSlideCopies` response in `functions/src/index.ts` (line ~5182)
- [x] T060 [P] [US4] Return `copyScoringTrace` in the `serverGenerateTestimonialCarousel` response in `functions/src/index.ts`
- [x] T061 [P] [US4] Add the opaque `copyScoringTrace` passthrough field to the relevant response/state types in `src/types.ts` — never rendered (FR-013, FR-014)
- [x] T062 [US4] Thread `copyScoringTrace` through frontend state in `src/App.tsx` from each copy callable's response into the `serverGenerateFinalAd` request payload — opaque passthrough, no UI, no conditional rendering (FR-013, Contract I1)
- [x] T063 [US4] Accept `request.data.copyScoringTrace` in `serverGenerateFinalAd` in `functions/src/index.ts` (line ~4767) and merge it into `_lastResolutionTrace.copyScoring` in `generateFinalAd`, appending each step to `steps[]` (FR-020, Contract I1)
- [x] T064 [US4] Emit one structured log line per gate outcome at each attach point in `functions/src/generators.ts` — ran / skipped / failed-open, cause, pass count — queryable by existing log-based monitoring, with no new collection and no scheduled job (FR-020a, FR-020b, Contract J1–J3)

**Checkpoint**: A silent outage is alertable; every decision is reconstructable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T065 Run `npm run build` and `npm test` in `functions/` and confirm the full chain passes including `copyScoringGate.test.js`
- [x] T066 [P] Run `npm run lint` in `functions/` and clear any new findings
- [x] T067 [P] Run `npm run build` at the repository root and confirm the frontend compiles with the passthrough field
- [x] T068 Verify every Contract A–L clause in `specs/966-copy-scoring-gate/contracts/copy-scoring-gate.md` has at least one asserting test; add any missing
- [x] T069 Execute the `quickstart.md` manual smoke matrix gate-on vs gate-off — per-field edit parity, 36-item batch parity, carousel hook pass-through, testimonial quote integrity, credential-removed run. Add an **end-to-end approved-vs-rendered check**: for each sampled generation, confirm the copy the advertiser approved in review is byte-identical to the copy on the rendered image, with zero divergence introduced by the gate (SC-006a). *(Quantitative copy-quality and latency measurement moved to Phase 8.)*
- [x] T070 Verify SC-007 by comparing the product before and after without access to the audit trail — confirm no score, badge, control, or message reveals the gate exists
- [x] T071 [P] Verify SC-008 — no new copy-fidelity failures attributable to gate-improved copy, and no increase in the fidelity retry rate
- [x] T072 [P] Add `specs/966-copy-scoring-gate/` to the Phase 22 row in `docs/LAUNCH_MATRIX.md` Section 14 and mark tasks 22.9 and 22.10 complete, noting Track 1 shipped under `specs/958-copy-quality/`
- [x] T073 [P] File a separate ticket for the pre-existing `_lastCopyDiversity` module-global survivor at `functions/src/generators.ts:1387`, which by the Phase 20 reasoning is broken in production — **do not fix it in this feature**
- [x] T074 Confirm reversal works: set `COPY_SCORING_ENABLED = false`, regenerate, and verify pre-feature behaviour returns with no code revert and no logic redeploy

---

## Phase 8: Sign-off Evidence (SC-001, SC-002, SC-006, SC-011)

**Purpose**: Prove the gate actually improved copy. Phases 1–7 build the gate and prove it cannot break anything; nothing in them answers "did copy quality go up?"

**⚠️ These scripts make LIVE model calls.** That is deliberate and distinct from the contract tests in Phases 2–6, which are stubbed per research R8. Sign-off evidence cannot be produced against stubs. Run against a non-production project with a funded key.

**Constitution Principle IX** requires before/after evidence and reproducible test inputs for every claimed fix. This phase is that evidence.

### Sample capture

- [x] T075 Build `scripts/copyQualitySample.mjs` — a paired-run capture harness. Takes a fixed input set of at least 50 generations spanning both languages and multiple offer types, runs each one twice with identical inputs (`COPY_SCORING_ENABLED` true then false), and persists per run: every on-creative string, the language, the field name, wall-clock end-to-end duration, credit cost, and the `copyScoring` trace. Output a single JSON artifact under `specs/966-copy-scoring-gate/validation/sample-<date>.json`. The input set MUST be committed alongside it so the run is reproducible (Constitution IX)
- [x] T076 Build the independent judge `scripts/copyQualityJudge.mjs` — scores each captured string on reading level (≤6th grade, yes/no) and lived-moment presence (concrete moment vs abstract category, yes/no). It MUST NOT import, share, or paraphrase the gate's scoring prompt from `functions/src/copyScoringGate.ts`, and SHOULD run on Gemini rather than the gate's OpenAI scorer — different prompt AND different model, so neither source of circularity survives. Arabic strings are judged against the "simple spoken-style فصحى a 12-year-old would say out loud" standard, never an English readability formula (FR-005, SC-002a, Constitution Principle V)

### Measurement

- [x] T077 [P] Run T076's judge over the full captured sample and compute **SC-001** (≥90% of gate-on strings read at or below 6th grade) and **SC-002** (lived-moment share improves ≥30 percentage points vs the gate-off arm). Record both figures in `specs/966-copy-scoring-gate/validation/results.md` with the sample size and date
- [x] T078 [P] Compute **SC-014** from the captured `copyScoring` traces — assert zero CTA or benefit fields were rewritten on lived-symptom grounds, and that the rewrite rate for those two fields is no higher than for headline and subheadline. This is the sample-level counterpart to T015's unit assertion
- [x] T079 Conduct the **product-owner spot-check**: a fixed 10-generation subsample covering both languages, reviewed by hand against the same two questions the judge answers. Record each verdict in `validation/results.md`. Where the human disagrees with the judge, **the human verdict wins** — correct the judge prompt, re-run T077 over the full sample, and record both the correction and the re-scored figures (SC-002a)
- [x] T080 Compute **SC-006** from the T075 capture — median end-to-end generation time gate-on vs gate-off must differ by ≤20%. Then run a separate timing pass at the largest permitted sizes (36-item batch, 10-slide carousel) and confirm no generation exceeds its existing timeout, since the 60-second run budget is the binding constraint there

### Compliance regression

- [x] T081 Run the existing `culturalCompliance.test.js` and `contractFixtures.test.js` suites unchanged and confirm both pass with the gate enabled — verifying this feature introduced no regression in the guards it rides beneath (FR-023)
- [x] T082 Add gated-output fixtures to `functions/src/__tests__/copyScoringGate.test.ts` asserting the hard compliance guards still fire on gate-produced copy: an invented named-person or precise statistic in a rewrite still triggers honest degradation, the NUMERIC FACT VIOLATION repair still fires, and an Arabic rewrite containing a trigger word is still substituted. Confirms the gate sits *below* those guards rather than bypassing them (FR-023, SC-011)

**Checkpoint**: The phase can now be claimed complete with evidence. SC-001, SC-002, SC-006, SC-011, and SC-014 all have recorded figures against a reproducible input set.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on Foundational. Independently testable, but the spec requires it to **ship with US1** — the gate must not reach production without it
- **US3 (Phase 5)**: Depends on Foundational; strengthens US1's ceilings
- **US4 (Phase 6)**: Depends on Foundational; traces whatever US1–US3 produce
- **Polish (Phase 7)**: Depends on all desired stories
- **Sign-off (Phase 8)**: Depends on all four user stories being complete and deployed behind the switch. Cannot run earlier — it measures real generations, not stubs

### Critical ordering within Phase 2

T009 (never-throws boundary) must land before any attach point in Phase 3. Attaching an unwrapped gate to a credit-consuming path is the one sequencing error with real user cost.

### Within User Story 1

T014–T018 (tests) → T019–T021 (score + threshold) → T022–T027 (rewrite + compliance) → T028–T029 (block integrity) → T030–T032 (hook attach + edit-path guard) → **MVP checkpoint** → T033–T035 (carousel + testimonial coverage)

### Parallel Opportunities

- T002, T003, T004 — different files
- T010, T011, T012 — three independent callable declarations
- T014–T018 — five independent test groups, all before implementation
- T036, T037 — independent test groups
- T047, T048, T049 — independent test groups
- T059, T060, T061 — different callables and files
- T066, T067, T071, T072, T073 — independent polish items
- T077, T078 — independent measurements over the same captured sample

---

## Parallel Example: User Story 1 tests

```bash
# Launch all five US1 test groups together before implementing:
Task: "Scoring tests (Contract B1–B6) in functions/src/__tests__/copyScoringGate.test.ts"
Task: "Threshold tests (Contract C1–C4)"
Task: "Rewrite tests (Contract D1–D5, D9–D10)"
Task: "Claim-flag tests (Contract D6–D8)"
Task: "Block-integrity tests (Contract E1–E4)"
```

```bash
# Launch the three secret-wiring tasks together:
Task: "Add openaiApiKey to serverGenerateTOV in functions/src/index.ts"
Task: "Add openaiApiKey to serverGenerateCarouselSlideCopies in functions/src/index.ts"
Task: "Add openaiApiKey to serverGenerateTestimonialCarousel in functions/src/index.ts"
```

---

## Implementation Strategy

### MVP (US1 through T032, plus US2)

1. Phase 1: Setup — kill switch first, so everything after is inert by default
2. Phase 2: Foundational — types, never-throws boundary, secrets
3. Phase 3 through T032 — gate core plus the hook attach point. This alone covers **single, batch, and retargeting**, because batch authors no copy of its own
4. Phase 4 — fail-open. Do not ship the MVP without it
5. **STOP and VALIDATE**: gate-on vs gate-off on real generations in both languages
6. Deploy behind the switch; flip on when the smoke matrix passes

### Incremental Delivery

1. Setup + Foundational → gate exists, inert, provably safe
2. US1 (to T032) + US2 → **MVP**: single / batch / retargeting gated, fail-open proven
3. T033–T035 → carousel and testimonial coverage
4. US3 → ceilings enforced and asserted
5. US4 → full auditability and outage alerting
6. Phase 8 → sign-off evidence: the figures that let the phase be *claimed* complete

Each increment is independently deployable behind the switch. Phase 8 is not deployable — it is
measurement, and it runs against a deployed gate.

### Parallel Team Strategy

After Phase 2:

- Developer A: US1 (the largest phase — gate core and attach points)
- Developer B: US2 (fail-open, budgets, credit invariance) — shares `copyScoringGate.ts` with A, so coordinate on the wrapper seam from T009
- Developer C: US4 (trace transport spans `index.ts`, `src/types.ts`, `src/App.tsx` — largely disjoint from A and B)

US3 is small and best folded into whoever finishes first.

---

## Notes

- **Never use a module-global survivor for the trace.** Research R1, Contract I2, and the ⚠️ banner above. A prior attempt at this feature reached for exactly that pattern; it tests green locally and writes `undefined` in production.
- `copyScoring` must be added to **both** `ResolutionTrace` definitions (T006 and T007).
- T031 is the highest-risk task in the list: the edit paths share a generator with initial generation, so a missed distinction silently overwrites copy the advertiser deliberately asked for. It fails with no error.
- Transcribed testimonial content is untouchable (T035). Rewriting it fabricates a customer quote.
- `[P]` = different files, no dependency on an incomplete task.
- Commit after each task or logical group; stop at any checkpoint to validate independently.
