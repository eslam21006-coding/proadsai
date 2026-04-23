---

description: "Task list for the Cultural Compliance Hotfix (Arabic Market Guardrails)"
---

# Tasks: Cultural Compliance Hotfix (Arabic Market Guardrails)

**Input**: Design documents from `/specs/0951-hotfix-cultural-compliance/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cultural-compliance-block.md, contracts/trigger-word-scan.md, contracts/universe-arabic-safety.md
**Tests**: Included — the spec (HFC.9) and each contract explicitly require fixture coverage. Fixture tasks are listed BEFORE implementation tasks in each story per TDD convention; they MUST fail initially and pass after implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to a user story in spec.md (US1..US5)
- Include exact file paths in descriptions

## Path Conventions

Web application (Option 2 per plan.md §Project Structure):
- Frontend: `src/` (React, Vite, TS 5.9)
- Backend: `functions/src/` (Firebase Cloud Functions v2, TS 5.7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification before editing. This hotfix adds no new dependencies and no new tooling.

- [x] T001 Verify clean baseline: run `npm run lint` and `npm run build` from repo root, and `cd functions && npm test` — record any pre-existing failures so post-hotfix regression attribution is unambiguous

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type shapes and the single-source-of-truth module every user story imports from. Every task in Phases 3–7 depends on Phase 2 completing.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create new module `functions/src/culturalCompliance.ts` exporting: `HARAM_MOTIFS: readonly string[]`, `MOTIF_SUBSTITUTIONS: Readonly<Record<string,string>>`, `TRIGGER_WORDS: readonly string[]`, `SUBSTITUTIONS: Readonly<Record<string,string>>`, `CULTURAL_COMPLIANCE_BLOCK: string` (verbatim per `contracts/cultural-compliance-block.md §1.1`), `ARABIC_WARDROBE_BLOCK: string` (verbatim per `contracts/cultural-compliance-block.md §2.1`), `isArabic(adLanguage: string | undefined | null): boolean`, and `scanAndReplace(text: string, sourceLayer: 'imagePrompt' | 'adCopy'): { cleaned: string; matched: string[] }`. Include the module-level invariant assertions (every TRIGGER_WORDS key has a SUBSTITUTIONS entry; every HARAM_MOTIFS key has a MOTIF_SUBSTITUTIONS entry; no substitution value is itself a trigger word) as a pure `assertInvariants()` function called at import time in non-production builds.
- [x] T003 [P] Extend `Universe` interface in `src/universeDatabase.ts` to include a required (non-optional) `arabicSafe: boolean` field. DO NOT yet populate values on entries — just add the interface requirement so every existing entry becomes a compile error, pinning US1's implementation surface via the type system.
- [x] T004 [P] Extend `ResolutionTrace` interface in `functions/src/types.ts` with optional `culturalViolation?: { caught: true; matchedWords: string[]; sourceLayer: 'imagePrompt' | 'adCopy' | 'both' }`. Preserve every existing field; this is an additive change only.
- [x] T005 Extend `TraceBuilder` in `functions/src/resolutionTrace.ts`: add method `setCulturalViolation(params: { matchedWords: string[]; sourceLayer: 'imagePrompt' | 'adCopy' | 'both' }): TraceBuilder` and emit the new optional field from `build()` only when set. DO NOT emit when unset (keeps Firestore docs slim per data-model.md §2). **Depends on T004.**
- [x] T006 [P] Create `functions/src/__tests__/culturalCompliance.test.ts` — unit tests for the pure `scanAndReplace` function per `contracts/trigger-word-scan.md §7` test cases 1–6 (empty input, case-insensitivity, whole-word boundary, longest-match-first, non-overlapping, table invariants). These lock the function behavior before any consumer code imports it.

**Checkpoint**: Foundation ready — all five user stories unblocked.

---

## Phase 3: User Story 1 — Arabic user never sees haram environments in the universe picker (Priority: P1) 🎯 MVP

**Goal**: An Arabic-configured ad never offers, renders, or references haram environments at the UI / data layer. Seven blocked universes are hidden from the Arabic picker; motifs are pre-sanitized; the `r_sushi_bar` rename lands with a backwards-compatible read-side remap.

**Independent Test**: Per quickstart.md Check 1, Check 2, Check 8a, Check 8b, Check 8c. Verified by the HFC.9 fixture subset in `functions/src/contractFixtures.test.ts` asserted in `contracts/universe-arabic-safety.md §7`.

### Tests for User Story 1 (write FIRST, ensure they FAIL before implementation)

- [x] T007 [US1] Add the US1 fixture suite to `functions/src/contractFixtures.test.ts` — six assertions per `contracts/universe-arabic-safety.md §7`: (a) motif sanitization global — `UNIVERSES.every(u => u.visualMotifs.every(m => !HARAM_MOTIFS.includes(m)))`; (b) blocked-list count — exactly 7 entries have `arabicSafe: false` and the ids match the list in `universe-arabic-safety.md §2`; (c) Arabic picker filter — with `adLanguage = 'ar_fusha'` the filtered list contains none of `r_wine_cellar`, `r_wine_tasting`, `r_rooftop_bar`, `r_cigar_lounge`, `r_vineyard`, `r_dance_studio`, `r_sushi_counter`; (d) English picker pass-through — with `adLanguage = 'en'` every `UNIVERSES` entry is present; (e) rename integrity — no entry has `id === 'r_sushi_bar'`, one has `id === 'r_sushi_counter'`, and neither that entry's `name` nor `nameAr` contains a case-insensitive `bar` / `بار` substring; (f) legacy remap — loading a saved project whose stored `universeId === 'r_sushi_bar'` resolves to the renamed entry without throwing.

### Implementation for User Story 1

- [x] T008 [US1] Edit `src/universeDatabase.ts`: (a) populate `arabicSafe: false` on `r_wine_cellar` (line ~66), `r_wine_tasting` (~266), `r_rooftop_bar` (~56), `r_cigar_lounge` (~260), `r_vineyard` (~243), `r_dance_studio` (~171); (b) rename the former `r_sushi_bar` (line ~270) to `r_sushi_counter` — update `id`, update `name` to `Premium Sushi Counter`, update `nameAr` to drop `بار` (use a counterpart like `كاونتر سوشي فاخر` or the agreed Arabic display string), and set `arabicSafe: false`; (c) add `arabicSafe: true` on every other entry (~73 entries). All edits in a single pass to keep the file compileable at every intermediate state.
- [x] T009 [US1] In `src/universeDatabase.ts`, above the `UNIVERSES` export, define `const HARAM_MOTIFS: readonly string[] = [...]` and `const MOTIF_SUBSTITUTIONS: Readonly<Record<string,string>> = {...}` with the exact content specified in `data-model.md §3` (the frontend copy is intentional — the data layer cannot import from `functions/src/` at build time; a module-load invariant test in T006's sibling frontend test suite or a one-time code review ensures parity with the backend module). Apply substitutions at module-load time by mapping over the `UNIVERSES` literal — every `visualMotifs` entry that matches `HARAM_MOTIFS` is replaced per `MOTIF_SUBSTITUTIONS`. The export is the sanitized array; the literal stays untouched in source for diffability. **Depends on T008.**
- [x] T010 [P] [US1] Edit `src/components/InputForm.tsx`: apply the picker filter `UNIVERSES.filter(u => isArabic(inputs.adLanguage) ? u.arabicSafe : true)` (add a local frontend `isArabic` helper that mirrors the backend's `adLanguage?.startsWith('ar') ?? false`; parity with the backend is verified by T007 fixture (c)+(d) only — drift risk is acknowledged and accepted per research.md D-1). Also: when the selected `universeId` becomes empty due to the auto-clear wiring (T011), render an inline prompt on the picker (`"اختر بيئة متوافقة"` / `"Pick an Arabic-safe environment"`) and disable the Generate button via the existing `canGenerate` derivation.
- [x] T011 [US1] In `src/App.tsx` (the language-switcher handler), implement FR-009: when the user flips `adLanguage` from a non-`ar*` to an `ar*` locale and the currently selected `universeId` resolves to an entry with `arabicSafe === false`, (a) clear only the `universeId` field in the Zustand store, (b) leave every other field untouched (hook text, subhead, concept, copy, reference uploads, build-plan history), (c) emit an auto-switch trace event via the existing `addAutoSwitchEvent('universe', <oldId>, '', 'cultural_compliance_language_switch')` — do NOT introduce a new trace field for this event.
- [x] T012 [US1] In the saved-project loader (`src/App.tsx` → `loadProject(p)`), implement FR-010: when `isArabic(p.inputs.adLanguage)` and the resolved universe has `arabicSafe === false`, restore every field of the `SavedProject` as-is (hook, subhead, concept, build-plan history, mockup history, copy) but compute a derived `canGenerate: false` in the store and ensure the Generate button reads that flag. No modal. No field reset. The project becomes fully editable immediately; only the Generate action is gated. **Depends on T011 (shares store state).**
- [x] T013 [US1] In the saved-project loader path, implement FR-011: if `p.inputs.universeId === 'r_sushi_bar'`, map it to `'r_sushi_counter'` before calling the universe-lookup. This is a read-side shim only — do not force a save. Place the remap immediately before the universe lookup so it is colocated with the resolution site. **Depends on T008 (renamed entry must exist).**

**Checkpoint**: User Story 1 is independently testable against quickstart.md Check 1, 2, 8a, 8b, 8c. Every fixture in T007 passes. The Arabic picker is clean and a legacy saved project still loads.

---

## Phase 4: User Story 2 — Arabic ads never render alcohol, bars, or haram elements (Priority: P1)

**Goal**: The CULTURAL_COMPLIANCE_BLOCK is present in every build-plan prompt AND every final image-model prompt for every Arabic single / carousel slide / batch item. English prompts remain unaffected.

**Independent Test**: Per quickstart.md Check 3, Check 5, and the HFC.9 subset asserted in `contracts/cultural-compliance-block.md §3`.

### Tests for User Story 2 (write FIRST)

- [x] T014 [US2] Add the US2 fixture suite to `functions/src/contractFixtures.test.ts` — five assertions per `contracts/cultural-compliance-block.md §3`: (a) Arabic single ad in `r_private_jet` → build-plan prompt contains the exact `CULTURAL_COMPLIANCE_BLOCK` string BEFORE the `TECHNICAL_PROMPT_START` marker, and contains `sparkling drinks` (not `champagne`) in the motif section; (b) Arabic single ad → `buildFinalImagePrompt()` output contains the compliance block near the top; (c) Arabic carousel of 4 slides → slide 3's prompt contains the compliance block; (d) Arabic batch of 2+ items → item 2's prompt contains the compliance block; (e) English single ad → build plan and final image prompt both contain ZERO occurrences of the compliance block string.

### Implementation for User Story 2

- [x] T015 [US2] In `functions/src/generators.ts::generateBuildPlan()`: at the point where the prompt string is assembled, inject `CULTURAL_COMPLIANCE_BLOCK` immediately BEFORE the `TECHNICAL_PROMPT_START` marker (imported from `buildPlanSlotMap.ts`) when `isArabic(inputs.adLanguage)` is true. Import the block from `functions/src/culturalCompliance.ts` — DO NOT inline the string. When `isArabic` is false, do not inject.
- [x] T016 [US2] In `functions/src/generators.ts::buildFinalImagePrompt()` (currently line 3848): inject `CULTURAL_COMPLIANCE_BLOCK` near the top of the assembled final prompt (above composition / lighting / camera notes) when `isArabic(adLanguage)` is true. Same import discipline as T015.
- [x] T017 [US2] Audit the carousel-assembly path in `functions/src/generators.ts`: confirm that each slide's call to `buildFinalImagePrompt()` passes the correct `adLanguage` so the T016 injection fires per slide. If the carousel path bypasses `buildFinalImagePrompt` or dilutes the language signal, repair the wiring so slide 3 is indistinguishable from slide 1 for the purposes of the compliance block. Record the carousel entry point in a code comment pointing to `contracts/cultural-compliance-block.md §1.2` so future contributors do not re-break the per-slide invariant.
- [x] T018 [US2] Audit the batch-assembly path in `functions/src/generators.ts`: same obligation as T017 for per-item injection. The contract fixture T014(d) is the authoritative proof.

**Checkpoint**: User Story 2 passes quickstart.md Check 3 and Check 5. Every Arabic image prompt carries the compliance block; every English image prompt does not.

---

## Phase 5: User Story 3 — Arabic ads depict people in modest dress (Priority: P1)

**Goal**: The ARABIC_WARDROBE_BLOCK is present in the wardrobe section of every Arabic build-plan prompt and every Arabic final image prompt — including per slide and per batch item.

**Independent Test**: Per quickstart.md Check 4 and the HFC.9 subset derived from `contracts/cultural-compliance-block.md §2`.

### Tests for User Story 3 (write FIRST)

- [x] T019 [US3] Add the US3 fixture suite to `functions/src/contractFixtures.test.ts` — four assertions: (a) Arabic single ad with a human figure → build-plan wardrobe section contains the exact `ARABIC_WARDROBE_BLOCK` string; (b) Arabic single ad → `buildFinalImagePrompt()` output contains the wardrobe block; (c) Arabic carousel slide with a figure → that slide's prompt contains the wardrobe block; (d) English single ad with a figure → wardrobe section does NOT contain the Arabic modesty rules.

### Implementation for User Story 3

- [x] T020 [US3] In `functions/src/generators.ts::generateBuildPlan()`: locate the wardrobe-instruction assembly (existing wardrobe / COSTUME language around the universe-adapt sections, approx lines 2040–2055) and APPEND `ARABIC_WARDROBE_BLOCK` when `isArabic(inputs.adLanguage)` is true. Append, do not replace — the existing wardrobe text still applies; the Arabic rules are additive reinforcement.
- [x] T021 [US3] In `functions/src/generators.ts::buildFinalImagePrompt()`: same obligation — append `ARABIC_WARDROBE_BLOCK` to the wardrobe section of the final prompt when `isArabic(adLanguage)` is true.
- [x] T022 [US3] Audit the carousel and batch assembly paths to confirm that each slide / item receives the wardrobe block when Arabic. If T017 / T018 resolved the language-signal wiring correctly, this should follow automatically; the audit is a belt-and-braces step to confirm.

**Checkpoint**: User Story 3 passes quickstart.md Check 4. Every Arabic figure render is produced under modesty rules; English is unaffected.

---

## Phase 6: User Story 4 — Post-generation validation catches leaked haram terms in both image prompts and ad copy (Priority: P1)

**Goal**: After prompt assembly, run `scanAndReplace` on (a) the technical-prompt text and (b) the concatenated hook + subhead + caption — for Arabic ads only. Aggregate matches into `resolutionTrace.culturalViolation` with `sourceLayer: 'imagePrompt' | 'adCopy' | 'both'`. Customer-facing response payload does NOT carry this field.

**Independent Test**: Per quickstart.md Check 6 and the HFC.9 subset asserted in `contracts/trigger-word-scan.md §7`.

### Tests for User Story 4 (write FIRST)

- [x] T023 [US4] Add the US4 fixture suite to `functions/src/contractFixtures.test.ts` — six assertions per `contracts/trigger-word-scan.md §7`: (a) image-layer replacement — stubbed build plan with `"cocktail"` in `TECHNICAL_PROMPT` → outgoing prompt contains `"artisan coffee"` not `"cocktail"`, trace has `culturalViolation: { caught: true, matchedWords: ['cocktail'], sourceLayer: 'imagePrompt' }`; (b) ad-copy-layer replacement — stubbed hook with `"champagne"` → returned hook contains `"sparkling water"`, trace has `sourceLayer: 'adCopy'`; (c) both-layer aggregation — stub with `"wine"` in tech prompt AND `"cocktail"` in caption → trace has `matchedWords: ['wine', 'cocktail'], sourceLayer: 'both'` with image-layer matches preceding copy-layer matches; (d) English no-op — English ad with `"wine"` in prompt and `"champagne"` in caption → text unchanged, trace has NO `culturalViolation` field; (e) case-insensitivity — Arabic ad with `"Wine"` → replacement fires, `matchedWords: ['wine']` (lowercased to match trigger list canonicalization); (f) response-shape invariant — the function's returned client payload does NOT contain `resolutionTrace.culturalViolation` regardless of whether the Firestore document does.

### Implementation for User Story 4

- [x] T024 [US4] In `functions/src/generators.ts`, after the build plan is parsed (after `parseStructuredBuildPlanResponse` returns), when `isArabic(inputs.adLanguage)` is true: extract the technical-prompt text (the span between `TECHNICAL_PROMPT_START` and `TECHNICAL_PROMPT_END`), call `scanAndReplace(techText, 'imagePrompt')`, and if `matched.length > 0` splice `cleaned` back into the prompt that will be dispatched to the image model. Capture `matched` for T026's trace aggregation. Import `scanAndReplace` and `isArabic` from `./culturalCompliance.js`.
- [x] T025 [US4] In the same generator path, after hook text, subhead text, and caption text are produced (these are produced at different stages — hooks early, caption late — so this is three call sites, not one): for each Arabic ad-copy field, call `scanAndReplace(text, 'adCopy')`, write `cleaned` back to the field that is returned to the user and persisted to the generation record, and capture `matched` for T026's aggregation. Deduplicate matches by keeping first-occurrence order across the three fields.
- [x] T026 [US4] Aggregate `imageMatched` and `copyMatched` from T024 + T025. If either is non-empty, call `traceBuilder.setCulturalViolation({ matchedWords, sourceLayer })` per the table in `contracts/trigger-word-scan.md §4`: `'imagePrompt'` when only image-layer hit, `'adCopy'` when only copy-layer hit, `'both'` when both; `matchedWords` deduplicated with image-layer-first ordering. Do NOT emit when both lists are empty. The existing `persistTrace(genId, trace)` call will then write the optional field to Firestore. **Depends on T024, T025.**
- [x] T027 [US4] Audit the response-serialization seam: confirm the client payload returned from the Cloud Function does NOT include `resolutionTrace.culturalViolation`. The response shaper should either (a) strip the full `resolutionTrace` from client responses (if that is already the pattern), or (b) explicitly omit the `culturalViolation` sub-field. Record the chosen approach in a code comment pointing to `contracts/trigger-word-scan.md §6`. The T023(f) fixture is the authoritative proof.

**Checkpoint**: User Story 4 passes quickstart.md Check 6. Trigger words in either layer are caught, replaced, and logged internally; nothing leaks to the customer.

---

## Phase 7: User Story 5 — English ads are unaffected (Priority: P1)

**Goal**: Cross-cutting control. English ads pass through unchanged: every universe visible, no compliance block, no wardrobe block, no trigger-word scan, no `culturalViolation` trace field.

**Independent Test**: Per quickstart.md Check 2 and Check 7, plus the English-control branch of every fixture added in T007, T014, T019, T023.

### Tests for User Story 5

- [x] T028 [US5] Add a consolidated US5 English-control fixture block to `functions/src/contractFixtures.test.ts` (sharing the same file as prior test tasks, so sequential): (a) English picker — `UNIVERSES.filter(u => isArabic('en') ? u.arabicSafe : true).length === UNIVERSES.length`; (b) English build plan — prompt does not contain `CULTURAL_COMPLIANCE_BLOCK` nor `ARABIC_WARDROBE_BLOCK`; (c) English ad with `"wine"` in a generated caption — caption returned to client contains `"wine"` verbatim, trace has no `culturalViolation` field; (d) English saved-project load — a saved project with `adLanguage: 'en'` and `universeId: 'r_wine_cellar'` loads with `canGenerate: true` and no inline picker prompt. Some assertions here overlap with the English control branches inside T007(d), T014(e), T019(d), T023(d) — keep both. Per-story redundancy is acceptable because US5 is a standalone acceptance story, not only a test-mode of the others.

### Implementation for User Story 5 (audit + enforcement)

- [x] T029 [US5] Code audit across `src/universeDatabase.ts`, `src/components/InputForm.tsx`, `src/App.tsx`, `functions/src/generators.ts`, and `functions/src/culturalCompliance.ts`: grep for every call site that reads the `arabicSafe` flag or that injects `CULTURAL_COMPLIANCE_BLOCK` / `ARABIC_WARDROBE_BLOCK` / calls `scanAndReplace`. Confirm that EVERY such site is guarded by `isArabic(adLanguage)` or by `u.arabicSafe` as appropriate — no unconditional fire. Record the findings as a short comment block at the top of `functions/src/culturalCompliance.ts` listing the gated call sites (one line each) for future-contributor safety. If any unconditional fire is found, repair it in-place and re-run the US5 fixture suite.

**Checkpoint**: User Story 5 passes quickstart.md Check 2 and Check 7. The five P1 stories now form a complete, internally consistent hotfix.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Ship-readiness verification. No code changes here beyond any fixes surfaced by the checks.

- [x] T030 [P] Run `cd functions && npm test` — the full Jest suite MUST pass, including all new cultural-compliance fixtures (T007, T014, T019, T023, T028) and the `culturalCompliance.test.ts` unit suite (T006). Zero regressions in pre-existing fixtures.
- [x] T031 [P] Run `npm run lint && npm run build` at repo root — frontend lint clean, TypeScript compile clean, Vite bundle builds without warnings about missing types on `arabicSafe`.
- [x] T032 Grep sweep: `grep -r "r_sushi_bar" src/ functions/src/ specs/0951-hotfix-cultural-compliance/` — the only hit SHOULD be in the saved-project-loader legacy-remap branch (T013) and in the spec/plan/contracts prose. No remaining `id: 'r_sushi_bar'` in data files.
- [x] T033 Execute every check in `specs/0951-hotfix-cultural-compliance/quickstart.md` (Check 1 through Check 8c) against the staging deployment. Every check MUST PASS before merge. If any check FAILS, triage to the offending task in Phases 3–7 and repair. The rollback procedure in quickstart.md §Rollback criteria is the abort path if staging validation cannot be green within the deploy window.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. BLOCKS all user stories. T005 depends on T004. T002, T003, T004, T006 are parallelizable [P] among themselves.
- **US1 (Phase 3)**: Depends on Phase 2 (needs `arabicSafe` field from T003; does not need T002 until T008's sanitization needs `HARAM_MOTIFS` — the frontend copy of the constant is authored in T009, which is fine). Within US1: T007 (tests) first; then T008 (data layer); T009 depends on T008; T010 is [P] with T011/T012/T013; T011 / T012 / T013 share `src/App.tsx` state and must be sequenced.
- **US2 (Phase 4)**: Depends on Phase 2 (needs T002's `CULTURAL_COMPLIANCE_BLOCK` constant and `isArabic` helper). Independent of US1 on the code side, but real-world value depends on US1's motif sanitization having landed too. T014 (tests) first; T015 / T016 / T017 / T018 share `functions/src/generators.ts` and must be sequenced.
- **US3 (Phase 5)**: Depends on Phase 2. Effectively independent of US2 at the code level (different sections of the same prompt), but since both edit `generators.ts`, sequence US3's implementation tasks after US2's to minimize merge conflicts. T019 (tests) first.
- **US4 (Phase 6)**: Depends on Phase 2 (needs `scanAndReplace`, `setCulturalViolation`). Depends on US2 + US3 for realistic end-to-end behavior, but its own tests stub the build-plan text so the scan can be tested against a known input without requiring the block injections to work. T023 (tests) first; T024 / T025 independent of each other but both edit `generators.ts`; T026 depends on both; T027 is a late audit.
- **US5 (Phase 7)**: Depends on Phase 2. Logically depends on US1 + US2 + US3 + US4 (it is the negative-control verification that proves every gate is working), but the tasks themselves are tests + a code audit.
- **Polish (Phase 8)**: Depends on all Phases 1–7.

### User Story Dependencies

- **US1 (P1)** — blocks nothing at the code level, but landing alone ships a picker change without prompt-layer protection, which is not shippable. Land all five stories in one PR.
- **US2 (P1)** — no code dependency on US1. Value is compounded when US1's sanitized motifs land.
- **US3 (P1)** — no code dependency on US2, but both edit `generators.ts` — sequence merges carefully.
- **US4 (P1)** — independently testable with stubbed inputs; shipping US4 without US1–US3 would leave most Arabic renders haram except in the rare case of trigger-word leaks — not shippable alone.
- **US5 (P1)** — pure verification; no code to ship independently. The audit step (T029) is the only non-test work.

### Within Each User Story

- Fixture tasks (T007, T014, T019, T023, T028) come FIRST; write them to fail, then implement until they pass.
- Data layer before prompt layer (US1 T008 before US2 T015).
- Scan layer (US4) after its consumers' text exists (after the build plan is parsed; after hook/subhead/caption are produced).
- Polish only after every story is green.

### Parallel Opportunities

- **Phase 2 kickoff**: T002, T003, T004, T006 in parallel (four files). T005 joins after T004.
- **Within US1**: T010 [P] (frontend) is parallel with T011/T012/T013 (frontend App.tsx sequence), but only if two engineers split work — otherwise sequence cleanly.
- **Phase 8**: T030 and T031 in parallel (different command invocations, different repos / workspaces).

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Four engineers can work in parallel at Phase 2 kickoff:
Engineer A: T002 — Create functions/src/culturalCompliance.ts
Engineer B: T003 — Extend Universe interface in src/universeDatabase.ts
Engineer C: T004 — Extend ResolutionTrace interface in functions/src/types.ts
Engineer D: T006 — Write unit tests in functions/src/__tests__/culturalCompliance.test.ts (stubs T002's exports until T002 lands)

# T005 sequences after T004.
```

---

## Implementation Strategy

This hotfix is NOT amenable to the classic "MVP-only" strategy because US1 alone (picker filter) still lets Arabic ads render alcohol motifs in universes like `r_private_jet` that remain Arabic-safe. All five stories must land in one PR. The sequencing below is the recommended ORDER for a single engineer or a small team.

### Sequential path (single engineer)

1. Phase 1 (T001) — baseline.
2. Phase 2 (T002–T006) — foundation in one commit.
3. US1: T007 (tests fail) → T008 → T009 → T010 → T011 → T012 → T013 → re-run T007 (pass).
4. US2: T014 (tests fail) → T015 → T016 → T017 → T018 → re-run T014 (pass).
5. US3: T019 (tests fail) → T020 → T021 → T022 → re-run T019 (pass).
6. US4: T023 (tests fail) → T024 → T025 → T026 → T027 → re-run T023 (pass).
7. US5: T028 (run against working code — most should already pass from earlier phases) → T029 (audit).
8. Polish: T030 → T031 → T032 → T033.

### Small-team path (2–3 engineers, parallel-per-phase)

1. Phase 1 together.
2. Phase 2: split T002 / T003 / T004+T005 / T006 across engineers.
3. US1 + US2 in parallel (US1 touches `src/`, US2 touches `functions/src/generators.ts` — no merge conflict).
4. US3 after US2 (both touch `generators.ts`).
5. US4 after US3 (stacks on top of `generators.ts` edits).
6. US5 + Polish together.

---

## Notes

- Every cultural-compliance constant (blocks, trigger list, substitution tables, Arabic-detection predicate) is imported from `functions/src/culturalCompliance.ts` on the backend. The frontend re-authors the minimal subset it needs (`isArabic`, `HARAM_MOTIFS`, `MOTIF_SUBSTITUTIONS`) in `src/universeDatabase.ts` per research.md D-1. Parity is verified by fixture T007(a,c,d) and by the code-audit T029 — no silent drift allowed.
- The `resolutionTrace.culturalViolation` field is STRICTLY internal (FR-024, clarification Q4). Task T027 is the response-shape guard; task T023(f) is the authoritative proof.
- Do NOT introduce a second gate site (e.g., backend submission check on the universe id). The picker filter in T010 is the single gate. Adding a backend check duplicates truth and violates Principle XI (plan.md Constitution Check).
- Legacy `r_sushi_bar` remap (T013) is read-side only. Do not run a background migration, do not rewrite stored documents on load. Let natural edits-and-saves upgrade the id over time.
- Commit after each task or at minimum after each user story's checkpoint. Keep commit messages pointing to the task id (e.g., `fix(compliance): T015 inject CULTURAL_COMPLIANCE_BLOCK in generateBuildPlan`).
- Avoid: inlining the compliance/wardrobe block strings (always import from `culturalCompliance.ts`); inlining `'ar'` prefix checks (always use `isArabic`); adding user-facing notifications of post-validation replacements (violates FR-024 and clarification Q4).
