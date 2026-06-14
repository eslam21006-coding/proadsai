# Tasks: Phase 22 — Copy Quality Upgrade

**Input**: Design documents from `/specs/958-copy-quality/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/copy-quality-constants.md, quickstart.md

**Tests**: INCLUDED. The constitution (Principle IV behavior contracts, Principle IX reproducible proof) and research R8 require deterministic test coverage. Tests are string/parser assertions modeled on `culturalCompliance.test.ts` — no live model calls.

**Organization**: Tasks grouped by user story. All work lands in `functions/src/`. The reference `specs/_shared/COPY_SYSTEM_REFERENCE.md` is the source of truth for every rule's wording — transcribe, do not invent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (maps to spec.md user stories)

## Path Conventions

Backend Firebase Functions only:
- Constants: `functions/src/copywriting_knowledge.ts`
- System instruction: `functions/src/promptConstants.ts`
- Prompt wiring + parser: `functions/src/generators.ts`
- Types: `functions/src/types.ts`
- Tests: `functions/src/__tests__/copyQuality.test.ts`
- Untouched (regression guards): `functions/src/captionValidator.ts`, `functions/src/knowledge/hookAnglesKnowledge.ts`, `functions/src/textCompositing.ts`, `src/` (frontend)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Drift discipline + baseline confidence before edits.

- [ ] T001 Add the drift-control header comment to the top of `functions/src/copywriting_knowledge.ts` (immediately after the existing `// Version 7.1` block): `// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md — edit the reference first, then sync these constants.` (FR-015, FR-016)
- [ ] T002 [P] Confirm baseline is green before changes: from `functions/` run `npm run build` and `npm test`; record that all existing tests pass (SC-006 baseline).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing every story relies on — the single system instruction and the shared test harness.

**⚠️ CRITICAL**: Complete before starting any user story.

- [ ] T003 Append the verbatim Section-18 Track-1 system instruction (all four rules: ≤6th-grade reading level; lived-symptom; soft fabrication-flag with `CLAIM_FLAG` reminder; banned-CTA list + `[verb] [offer] → [payoff]` formula) to the end of the `SYSTEM_TOV` template literal in `functions/src/promptConstants.ts`. Inline the rule text directly (no cross-module import) per research R2. Do not change existing SYSTEM_TOV constraints. (FR-010, FR-011)
- [ ] T004 [P] Create the test harness `functions/src/__tests__/copyQuality.test.ts` (skeleton modeled on `culturalCompliance.test.ts` — plain assertions, throws on failure) and register it in the `test` script chain in `functions/package.json` (`node lib/__tests__/copyQuality.test.js`). (research R8)

**Checkpoint**: SYSTEM_TOV carries all Track-1 rules; test file runs in the suite. Story work can begin.

---

## Phase 3: User Story 1 — Plain-language, recognizable copy (Priority: P1) 🎯 MVP

**Goal**: Every generated copy field (and carousel caption) reads at ≤6th grade and names the concrete lived moment, on English and Arabic paths.

**Independent Test**: Generate ads across ≥3 offer types and both languages; sample copy fields → short everyday words / short sentences / no jargon-abstract nouns (Arabic = simple spoken فصحى), and the problem is a concrete recognizable moment, not an abstract category (SC-001, SC-002).

- [ ] T005 [US1] Add the `READING_LEVEL_BLOCK` exported `string` constant to `functions/src/copywriting_knowledge.ts`, transcribing reference Section 0 (reading level) + Section 9 — ≤6th grade, short everyday words, short sentences, no jargon, no abstract nouns; Arabic = simple spoken-style فصحى a 12-year-old would say. (FR-002)
- [ ] T006 [US1] Add the `LIVED_SYMPTOM_BLOCK` exported `string` constant to `functions/src/copywriting_knowledge.ts`, transcribing reference Section 0 (depth) + Section 9 — never state the problem abstractly; name the exact concrete moment (scene/time of day/recognizable detail) pulled from pain + audience inputs. (FR-003)
- [ ] T007 [US1] Inject `READING_LEVEL_BLOCK` and `LIVED_SYMPTOM_BLOCK` (import both from `./copywriting_knowledge.js`) into the three non-SYSTEM_TOV prompt surfaces in `functions/src/generators.ts` using the `\n${BLOCK}\n` block-break pattern (mirror `CULTURAL_COMPLIANCE_BLOCK`): the live Step-2 hook prompt (~lines 2200–2279, cold + retargeting hook blocks), the retargeting `campaignInstruction` branch (~1447–1525), and the `generateCarouselSlideCopies()` prompt (~7340–7404). Apply to both Arabic and English paths. (FR-008, FR-011; research R1)
- [ ] T008 [P] [US1] Add test cases to `functions/src/__tests__/copyQuality.test.ts`: `READING_LEVEL_BLOCK` and `LIVED_SYMPTOM_BLOCK` exported + non-empty + contain their key signal phrases; rendered `SYSTEM_TOV` contains reading-level and lived-symptom signals; each of the three wired prompt builders includes both block markers. (SC-001, SC-002, SC-005)

**Checkpoint**: US1 independently verifiable — reading-level + lived-symptom rules live on all surfaces. MVP deliverable.

---

## Phase 4: User Story 2 — No generic CTAs (Priority: P1)

**Goal**: Generated CTA wording never uses the five banned phrases and follows `[verb] [offer] → [payoff]`; the user's literal CTA input is preserved.

**Independent Test**: Generate ads with a CTA across cold, retargeting, and carousel paths; no generated CTA wording uses a banned phrase; each pairs a specific verb with a pain/outcome payoff; `inputs.cta` is never overwritten (SC-003).

- [ ] T009 [US2] Add the `BANNED_CTA_LIST` exported `readonly string[]` constant to `functions/src/copywriting_knowledge.ts` = `["Learn more", "Sign up now", "Book now", "Get started", "Click here"]`. (FR-005)
- [ ] T010 [US2] Inject banned-CTA guidance derived from `BANNED_CTA_LIST` into the model-authored CTA points in `functions/src/generators.ts` (the CTA_BUTTON/benefit instruction at ~lines 2205 and 2251, and the carousel CTA slide). Guidance only — instruct the model to avoid the five phrases and use `[verb] [offer] → [payoff]`. MUST NOT add any post-generation reject/replace, and MUST NOT override the user's literal `inputs.cta` (research R4, Constitution Principle II). (FR-009)
- [ ] T011 [P] [US2] Add test cases to `functions/src/__tests__/copyQuality.test.ts`: `BANNED_CTA_LIST` deep-equals the five phrases; rendered `SYSTEM_TOV` contains the banned-CTA + CTA-formula signal; the CTA-point prompt builder includes the banned-list guidance; assert no code path overwrites `inputs.cta`. (SC-003)

**Checkpoint**: US2 independently verifiable — generated CTAs are non-generic; user input untouched.

---

## Phase 5: User Story 3 — Fabrication soft-flag with structured claimFlag (Priority: P2)

**Goal**: The model invents framing freely but emits a `CLAIM_FLAG` for any fabricated verifiable specific, captured as a structured `resolutionTrace.claimFlags` entry; nothing is blocked/deleted; existing hard compliance guards stay intact.

**Independent Test**: Generate copy with an invented specific → `claimFlags` records it, copy is produced in full; copy with only metaphor/hypothetical → no flag; the `CLAIM_FLAG` marker never appears in the four fields or on the rendered image; numeric-fact and honest-degradation guards still fire (SC-004, SC-006).

- [ ] T012 [US3] Add the `FABRICATION_POLICY_BLOCK` exported `string` constant to `functions/src/copywriting_knowledge.ts`, transcribing reference Section 0 (fabrication) + Section 4 — invent framing (scenarios/hypotheticals/metaphors) freely; flag — never block/delete/refuse — fabricated verifiable specifics (named person, exact figure, hard count, star rating, concrete deadline/quantity); do NOT flag obvious hypotheticals/metaphors; frees creative framing only, never numeric/identity compliance; and define the output contract: emit `CLAIM_FLAG: <verbatim specific> — <one-line reason>` lines AFTER the four copy fields. (FR-004, FR-004a; contract C3)
- [ ] T013 [P] [US3] Add the `ClaimFlagEntry` interface (`{ text: string; reason: string; field?: "hook"|"subhead"|"cta"|"benefit"|"slide" }`) and the additive optional `claimFlags?: readonly ClaimFlagEntry[]` field on the `ResolutionTrace` interface in `functions/src/types.ts`. Additive only — no migration. (data-model B, FR-004b)
- [ ] T014 [US3] Inject `FABRICATION_POLICY_BLOCK` into the same three non-SYSTEM_TOV surfaces wired in T007 (`functions/src/generators.ts`), appending one more block-break line per surface. (FR-008) — *depends on / coordinates with T007 (same prompt regions).*
- [ ] T015 [US3] Extend `extractCopyFieldsFromResponse()` in `functions/src/generators.ts` (~lines 470–519) to detect and STRIP all `CLAIM_FLAG:` lines before assembling the four fields, and return them as `ClaimFlagEntry[]`. Hard invariant: no `CLAIM_FLAG` substring may survive into `hookText`/`subheadText`/`ctaName`/`benefitText` (protects `validateCopyFidelity`). (research R3, contract C3)
- [ ] T016 [US3] Wire the parsed flags into `resolutionTrace.claimFlags` at the TOV/carousel callers (`generateTOV()` and `generateCarouselSlideCopies()` in `functions/src/generators.ts`); non-blocking — never fail generation when present. (data-model B, FR-004b)
- [ ] T017 [US3] Regression guard (read-only verification, no edits): confirm the `captionValidator.ts` NUMERIC FACT VIOLATION repair and the `hookAnglesKnowledge.ts` honest-degradation rules remain unchanged and still fire on their existing triggers. (FR-004a, contract C5)
- [ ] T018 [P] [US3] Add test cases to `functions/src/__tests__/copyQuality.test.ts`: `FABRICATION_POLICY_BLOCK` exported + contains framing-free/flag-not-block signals + the `CLAIM_FLAG` output contract; parser given a response WITH `CLAIM_FLAG:` lines returns the four fields with the marker fully stripped + structured flags; parser given NO marker returns unchanged fields and empty `claimFlags`; no-leak assertion. (SC-004, SC-006)

**Checkpoint**: US3 independently verifiable — fabrication advisories captured + auditable; gate and hard guards intact.

---

## Phase 6: User Story 4 — Reference/constant lockstep + seeded constants (Priority: P2)

**Goal**: The two later-track knowledge constants exist and faithfully transcribe the reference but are not wired; the drift marker is present; all six constants match their named reference sections.

**Independent Test**: Open `copywriting_knowledge.ts` → drift marker present; the six constants transcribe their reference sections; `COPY_SCORING_DIMENSIONS`/`COPY_REWRITE_DIAGNOSES` are exported, importable, and referenced by no runtime path (SC-007, SC-008, FR-014).

- [ ] T019 [US4] Add the `COPY_SCORING_DIMENSIONS` exported `string` constant to `functions/src/copywriting_knowledge.ts`, transcribing reference Section 12 — the 15-dimension 1–10 rubric incl. the two hard dimensions (reading level ≤6th grade, lived-symptom depth, each reject <7) and the pass condition (avg ≥8 AND no applicable dim <6 AND dims 14–15 ≥7). (FR-006)
- [ ] T020 [US4] Add the `COPY_REWRITE_DIAGNOSES` exported `string` constant to `functions/src/copywriting_knowledge.ts`, transcribing reference Section 13 — the diagnosis→fix table incl. the "Above 6th grade" and "Surface-level" rows + the max-2-pass rule. (FR-007)
- [ ] T021 [P] [US4] Add test cases to `functions/src/__tests__/copyQuality.test.ts`: all six constants exported + non-empty; the drift-marker line is present in the file source; `COPY_SCORING_DIMENSIONS` mentions the two hard dimensions and the pass rule; `COPY_REWRITE_DIAGNOSES` contains the two new diagnosis rows. (SC-007)
- [ ] T022 [P] [US4] Assert defined-but-unwired (FR-014): verify via `grep -rn "COPY_SCORING_DIMENSIONS\|COPY_REWRITE_DIAGNOSES" functions/src --include=*.ts` that the only references are the definition site (no runtime import in `generators.ts` or elsewhere). Document the result in the test or quickstart. (SC-008, FR-014)

**Checkpoint**: US4 verifiable — drift discipline in place; future constants seeded inert.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature regression, evidence, and scope-exclusion confirmation.

- [ ] T023 Run full `npm run build && npm test` from `functions/`; confirm all prior tests still pass and `copyQuality.test` passes — produces the Principle-IX before/after evidence and confirms no field-count/gate/compositor change (SC-006).
- [ ] T024 [P] Execute the `quickstart.md` static checks (drift header, six constants present, SYSTEM_TOV signals, two future constants unimported, trace field present); paste results as verification evidence.
- [ ] T025 [P] Scope-exclusion audit (FR-017, SC-008): confirm the change set contains no Phase-23 artifact (no director module, no UI dropdowns, no `HOOK_ANGLE_OPTIONS`/`HOOK_TYPE_OPTIONS`/`AWARENESS_LEVEL_OPTIONS`, no `STATIC_STRUCTURES`/`CAROUSEL_FRAMEWORKS`, no conditional field-count, no variation/anti-sameness code) and that `src/` (frontend) and the frontend `src/copywriting_knowledge.ts` mirror are untouched.

---

## Dependencies & Execution Order

**Phase order**: Setup (P1) → Foundational (P2) → US1 (P3) → US2 (P4) → US3 (P5) → US4 (P6) → Polish (P7).

**Hard dependencies**:
- T001, T002 before everything.
- T003 (SYSTEM_TOV) + T004 (test harness) before all story phases.
- Within US1: T005 → T006 (same file, append in order) → T007 (injection imports the constants); T008 parallel to T007.
- Within US2: T009 → T010; T011 parallel.
- Within US3: T012 + T013 (parallel, different files) → T014/T015/T016 (all `generators.ts`, sequential); T017 read-only anytime; T018 parallel to the trace work.
- **Cross-story coupling (call out at merge time)**: T014 (US3 fabrication injection) edits the SAME prompt regions as T007 (US1). If US1 and US3 are built in separate branches, their `generators.ts` injection edits will conflict and must be merged together. US2's CTA injection (T010) touches nearby but distinct lines (CTA_BUTTON instruction).
- Polish (T023–T025) last.

**Story independence**: Each story's *acceptance* is independently testable (reading-level vs CTA vs fabrication-flag vs drift are separately verifiable), even though US1/US2/US3 share `copywriting_knowledge.ts` and `generators.ts` files. Same-file constant additions are therefore not marked `[P]` across stories.

## Parallel Execution Examples

- **Setup/Foundational**: `T002` ∥ (after T001) ; `T004` ∥ `T003`.
- **Per story, constant vs test**: e.g. US1 `T008` (test file) runs parallel with `T007` (generators.ts). US3 `T013` (types.ts) parallel with `T012` (copywriting_knowledge.ts).
- **Polish**: `T024` ∥ `T025` (read-only audits) after `T023`.

## Implementation Strategy

- **MVP = Setup + Foundational + US1** (T001–T008): ships the two highest-value always-on quality rules (reading level + lived symptom) on every surface, riding the fidelity contract to every image. Independently shippable.
- **Increment 2 = US2** (T009–T011): removes generic CTAs.
- **Increment 3 = US3** (T012–T018): adds the auditable fabrication flag + structured trace (the only schema-touching increment).
- **Increment 4 = US4** (T019–T022): seeds the later-track constants + locks drift discipline.
- **Close-out = Polish** (T023–T025): full regression + scope-exclusion proof.

---

**Totals**: 25 tasks — Setup 2, Foundational 2, US1 4, US2 3, US3 7, US4 4, Polish 3.
