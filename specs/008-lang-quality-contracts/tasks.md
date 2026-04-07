# Tasks: Language Quality Contracts

**Input**: Design documents from `/specs/008-lang-quality-contracts/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — FR-013 explicitly requires per-language unit tests (3 per language minimum).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Shared types and data structures needed by all language quality checks

- [x] T001 Define `CaptionQualityResult`, `CaptionQualityCheck`, and `LanguageQualityInput` interfaces in `functions/src/captionValidator.ts` — see `specs/008-lang-quality-contracts/data-model.md` for exact field shapes
- [x] T002 [P] Create `functions/src/dialectMarkers.ts` with `DialectMarkerSet` interface and empty marker arrays for `ar_egyptian` and `ar_gulf` (to be populated in US2/US3 phases)
- [x] T003 [P] Create empty test file `functions/src/languageQuality.test.ts` with Node.js `assert/strict` import, a `main()` runner pattern matching existing `contractFixtures.test.ts`, and add `"test:lang": "npm run build && node lib/languageQuality.test.js"` script to `functions/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core dispatcher and shared check functions that ALL language-specific checks depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement `validateLanguageQuality(input: LanguageQualityInput): { result: CaptionQualityResult; repairPrompt: string | null }` dispatcher function in `functions/src/captionValidator.ts` — routes to per-locale check sets based on `input.locale`, returns aggregated results per `specs/008-lang-quality-contracts/contracts/language-quality-api.md` behavior contract. When any check fails, build a repair prompt string listing all failing rule IDs and their detail messages (reuse the existing `buildRepairPrompt()` pattern from line 605-621). Unsupported locales return `{ passed: true, checks: [], repairedAt: null, locale: input.locale }`
- [x] T005 Implement shared `checkHeadlineWordCount(headline: string, max: number): CaptionQualityCheck` function in `functions/src/captionValidator.ts` — uses `text.trim().split(/\s+/).length`, returns rule ID `headline_word_count`
- [x] T006 [P] Implement shared `checkSubheadlineWordCount(subheadline: string, max: number): CaptionQualityCheck` function in `functions/src/captionValidator.ts` — same logic as T005, returns rule ID `subheadline_word_count`
- [x] T007 [P] Implement shared `checkArabicUnicodeRatio(text: string, minRatio: number): CaptionQualityCheck` function in `functions/src/captionValidator.ts` — reuse existing Unicode range logic from `validateArabicCompliance()` (line 86-121), returns rule ID `arabic_unicode_ratio` with actual ratio in detail string

**Checkpoint**: Foundation ready — shared checks work, dispatcher routes correctly, test harness runs

---

## Phase 3: User Story 1 — Arabic Fusha Caption Validation (Priority: P1) MVP

**Goal**: Full validation contract for `ar_fusha`: word count (8/12), Arabic ratio (70%), hanging conjunctions, weak openers

**Independent Test**: Generate a Fusha caption and assert all 5 checks pass or trigger structured repair

### Implementation

- [x] T008 [US1] Implement `checkHangingConjunction(headline: string, subheadline: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — detect trailing و / ف / ثم at end of headline or subheadline after trimming whitespace, returns rule ID `hanging_conjunction`
- [x] T009 [US1] Implement `checkWeakOpener(headline: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — blocklist of ~10-15 Arabic weak opener regex patterns (e.g., هل تعلم, من المهم, نحن نقدم, هل تبحث عن), returns rule ID `weak_opener`
- [x] T010 [US1] Wire `ar_fusha` check set into the dispatcher (T004): `[checkHeadlineWordCount(8), checkSubheadlineWordCount(12), checkArabicUnicodeRatio(0.70), checkHangingConjunction, checkWeakOpener]`

### Tests

- [x] T011 [US1] Add `ar_fusha` pass test in `functions/src/languageQuality.test.ts` — 6-word Arabic headline, 85% Arabic ratio, no hanging conjunction, no weak opener → all checks pass
- [x] T012 [P] [US1] Add `ar_fusha` word count fail test — 11-word headline → `headline_word_count` fails
- [x] T013 [P] [US1] Add `ar_fusha` hanging conjunction fail test — subheadline ending with "و" → `hanging_conjunction` fails

**Checkpoint**: `ar_fusha` contract fully functional and tested independently

---

## Phase 4: User Story 2 — Egyptian Arabic Dialect Validation (Priority: P2)

**Goal**: Validation contract for `ar_egyptian`: word count, Arabic ratio, absence-based dialect markers, warmth register

**Independent Test**: Generate an Egyptian caption and verify dialect marker absence, warmth register, and word count compliance

### Implementation

- [x] T014 [US2] Populate Egyptian `wrongDialectMarkers` array in `functions/src/dialectMarkers.ts` — 15-30 Gulf/Levantine/Iraqi/Maghreb terms that should NOT appear in Egyptian captions (e.g., Gulf: حلو/زين/يالله, Levantine: هلق/كتير, Iraqi: شلون/ماكو, Maghreb: بزاف/واش)
- [x] T015 [US2] Implement `checkDialectMarkers(text: string, locale: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — import marker sets from `dialectMarkers.ts`, scan full caption for any wrong-dialect marker matches (case-insensitive word boundary), returns rule ID `dialect_markers` with matched marker in detail
- [x] T016 [US2] Implement `checkWarmthRegister(text: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — detect overly formal/cold tone indicators inappropriate for Egyptian advertising (e.g., formal Fusha constructions like إنّ / لذلك / بناءً على), returns rule ID `warmth_register`
- [x] T017 [US2] Wire `ar_egyptian` check set into dispatcher: `[checkHeadlineWordCount(8), checkSubheadlineWordCount(12), checkArabicUnicodeRatio(0.70), checkDialectMarkers, checkWarmthRegister]`

### Tests

- [x] T018 [US2] Add `ar_egyptian` pass test in `functions/src/languageQuality.test.ts` — Egyptian caption with correct colloquial vocabulary, warm tone → all checks pass
- [x] T019 [P] [US2] Add `ar_egyptian` word count fail test — 9-word headline → `headline_word_count` fails
- [x] T020 [P] [US2] Add `ar_egyptian` dialect marker fail test — caption containing Gulf marker "زين" → `dialect_markers` fails

**Checkpoint**: `ar_egyptian` contract fully functional and tested independently

---

## Phase 5: User Story 3 — Gulf Arabic Dialect Validation (Priority: P3)

**Goal**: Validation contract for `ar_gulf`: word count, Arabic ratio, absence-based dialect markers

**Independent Test**: Generate a Gulf caption and verify dialect markers and word count rules

### Implementation

- [x] T021 [US3] Populate Gulf `wrongDialectMarkers` array in `functions/src/dialectMarkers.ts` — 15-30 Egyptian/Levantine/Iraqi/Maghreb terms that should NOT appear in Gulf captions (e.g., Egyptian: عايز/ازيك/كده, Levantine: هلق/كتير, Iraqi: شلون, Maghreb: بزاف)
- [x] T022 [US3] Wire `ar_gulf` check set into dispatcher: `[checkHeadlineWordCount(8), checkSubheadlineWordCount(12), checkArabicUnicodeRatio(0.70), checkDialectMarkers]` — reuses `checkDialectMarkers` from T015 with Gulf marker set

### Tests

- [x] T023 [US3] Add `ar_gulf` pass test in `functions/src/languageQuality.test.ts` — Gulf caption with correct vocabulary → all checks pass
- [x] T024 [P] [US3] Add `ar_gulf` word count fail test — 9-word headline → `headline_word_count` fails
- [x] T025 [P] [US3] Add `ar_gulf` dialect marker fail test — caption containing Egyptian marker "عايز" → `dialect_markers` fails

**Checkpoint**: `ar_gulf` contract fully functional and tested independently

---

## Phase 6: User Story 4 — Levantine, Iraqi, and Maghreb Minimum Checks (Priority: P4)

**Goal**: Minimum validation for `ar_levantine`, `ar_iraqi`, `ar_maghreb`: word count + Arabic ratio (no dialect marker or register checks)

**Independent Test**: Generate a caption in any of these three dialects and verify word count and Arabic ratio

### Implementation

- [x] T026 [US4] Wire `ar_levantine`, `ar_iraqi`, and `ar_maghreb` check sets into dispatcher: `[checkHeadlineWordCount(8), checkSubheadlineWordCount(12), checkArabicUnicodeRatio(0.70)]` — uses only shared checks, no dialect-specific logic

### Tests

- [x] T027 [US4] Add `ar_levantine` pass test in `functions/src/languageQuality.test.ts` — valid Levantine caption within limits → all checks pass
- [x] T028 [P] [US4] Add `ar_levantine` word count fail test — 10-word headline → fails
- [x] T029 [P] [US4] Add `ar_levantine` Arabic ratio fail test — only 50% Arabic Unicode → `arabic_unicode_ratio` fails
- [x] T030 [P] [US4] Add `ar_iraqi` pass test — valid Iraqi caption → all checks pass
- [x] T031 [P] [US4] Add `ar_iraqi` word count fail test — 10-word headline → fails
- [x] T032 [P] [US4] Add `ar_iraqi` Arabic ratio fail test — below 70% Arabic → fails
- [x] T033 [P] [US4] Add `ar_maghreb` pass test — valid Maghreb caption → all checks pass
- [x] T034 [P] [US4] Add `ar_maghreb` word count fail test — 10-word headline → fails
- [x] T035 [P] [US4] Add `ar_maghreb` Arabic ratio fail test — below 70% Arabic → fails

**Checkpoint**: All three lighter dialects validated and tested

---

## Phase 7: User Story 5 — English Caption Validation (Priority: P5)

**Goal**: Validation contract for `en`: word count, capitalization, no repeated words, complete sentence, CTA clarity, no filler phrases

**Independent Test**: Generate an English caption and verify grammar, CTA presence, and filler phrase absence

### Implementation

- [x] T036 [P] [US5] Implement `checkCapitalization(headline: string, subheadline: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — first word of headline and subheadline must start with uppercase letter, returns rule ID `capitalization`
- [x] T037 [P] [US5] Implement `checkNoRepeatedWords(text: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — detect consecutive duplicate words (case-insensitive) in full caption, returns rule ID `no_repeated_words`
- [x] T038 [P] [US5] Implement `checkCompleteSentence(subheadline: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — subheadline must end with `.` or `!` or `?`, returns rule ID `complete_sentence`
- [x] T039 [P] [US5] Implement `checkCtaClarity(text: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — detect presence of action verbs or imperative CTA patterns (e.g., "Shop now", "Get yours", "Sign up", "Order today"), returns rule ID `cta_clarity`
- [x] T040 [P] [US5] Implement `checkNoFillerPhrases(text: string): CaptionQualityCheck` in `functions/src/captionValidator.ts` — blocklist of filler phrases (e.g., "in order to", "it is important to note that", "as a matter of fact", "at the end of the day"), returns rule ID `no_filler_phrases`
- [x] T041 [US5] Wire `en` check set into dispatcher: `[checkHeadlineWordCount(8), checkSubheadlineWordCount(12), checkCapitalization, checkNoRepeatedWords, checkCompleteSentence, checkCtaClarity, checkNoFillerPhrases]`

### Tests

- [x] T042 [US5] Add `en` pass test in `functions/src/languageQuality.test.ts` — English caption with clear CTA, proper capitalization, no filler → all checks pass
- [x] T043 [P] [US5] Add `en` word count fail test — 10-word headline → `headline_word_count` fails
- [x] T044 [P] [US5] Add `en` missing CTA fail test — caption with no action verb or imperative → `cta_clarity` fails

**Checkpoint**: English contract fully functional and tested independently

---

## Phase 8: User Story 6 — Pipeline Integration & Persistence (Priority: P6)

**Goal**: Wire `validateLanguageQuality()` into the caption generation pipeline in `generators.ts`, persist `captionQuality` to Firestore, and verify all 7 language test suites pass end-to-end

**Independent Test**: Run full test suite (`npm run build && node lib/languageQuality.test.js`) — all 21+ test cases pass

### Implementation

- [x] T045 [US6] Integrate `validateLanguageQuality()` call into `_generateCaptionInner()` in `functions/src/generators.ts` (around line 6419-6445) — call alongside existing `validateCaption()`, both must pass for caption to be accepted. On failure, append language quality repair prompt to existing `captionRepairPrompt`
- [x] T046 [US6] Extract headline and subheadline from generated caption in `generators.ts` before calling `validateLanguageQuality()` — parse the structured caption output to separate headline from subheadline (use line splitting or structured output markers)
- [x] T047 [US6] Persist `CaptionQualityResult` as `captionQuality` field on `generations/{genId}` Firestore document in `generators.ts` — write alongside existing generation record fields. Set `repairedAt` to `Date.now()` if repair attempt was made, otherwise `null`
- [x] T048 [US6] Add regression guard tests in `functions/src/languageQuality.test.ts` — (a) assert removing Arabic ratio check causes a test to fail, (b) assert removing CTA check causes a test to fail, (c) assert dispatcher returns `passed: true` for unsupported locale `fr`

**Checkpoint**: Full pipeline integrated — every generated caption is validated per its language contract, results persisted to Firestore, all tests green

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T049 [P] Verify all 7 language test suites pass by running `cd functions && npm run build && node lib/languageQuality.test.js` — must see 21+ passing test cases
- [x] T050 [P] Run existing test suite `cd functions && npm test` to confirm no regressions in `contractFixtures.test.ts`
- [x] T051 Run `npm run build` from `functions/` to confirm TypeScript compilation succeeds with no errors
- [x] T052 Review `captionValidator.ts` for any exported functions that need to be added to the import statement in `generators.ts` (line 22)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (types) — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (ar_fusha): Independent, no cross-story dependencies
  - US2 (ar_egyptian): Independent (dialect marker function created here, reused by US3)
  - US3 (ar_gulf): Depends on T015 from US2 (`checkDialectMarkers` function) — can run after T015 completes
  - US4 (lighter dialects): Independent — uses only shared checks from Phase 2
  - US5 (English): Independent — all checks are new
- **US6 (Integration)**: Depends on ALL user stories (US1-US5) being complete
- **Polish (Phase 9)**: Depends on US6 completion

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → US1 (ar_fusha) ──────────────────→ US6 (Integration) → Polish
                                           → US2 (ar_egyptian) → US3 (ar_gulf) ↗
                                           → US4 (lighter dialects) ────────────↗
                                           → US5 (English) ────────────────────↗
```

### Parallel Opportunities

- T002 + T003 can run in parallel (Setup phase)
- T005 + T006 + T007 can run in parallel (Foundational shared checks)
- US1, US2, US4, US5 can all start in parallel after Phase 2
- US3 can start after T015 (checkDialectMarkers from US2)
- Within US5: T036-T040 are all parallel (independent English check functions)
- Within US4: all test tasks (T027-T035) are parallel
- T049 + T050 can run in parallel (Polish verification)

---

## Parallel Example: User Story 5 (English)

```bash
# Launch all English check implementations in parallel (different functions, no dependencies):
Task T036: "checkCapitalization in functions/src/captionValidator.ts"
Task T037: "checkNoRepeatedWords in functions/src/captionValidator.ts"
Task T038: "checkCompleteSentence in functions/src/captionValidator.ts"
Task T039: "checkCtaClarity in functions/src/captionValidator.ts"
Task T040: "checkNoFillerPhrases in functions/src/captionValidator.ts"

# Then wire dispatcher (depends on all above):
Task T041: "Wire en check set into dispatcher"

# Then tests:
Task T042: "en pass test"
Task T043: "en word count fail test" (parallel with T044)
Task T044: "en missing CTA fail test" (parallel with T043)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007)
3. Complete Phase 3: US1 — ar_fusha (T008-T013)
4. **STOP and VALIDATE**: Run `npm run build && node lib/languageQuality.test.js` — 3 ar_fusha tests pass
5. ar_fusha contract is independently functional

### Incremental Delivery

1. Setup + Foundational → shared infrastructure ready
2. Add US1 (ar_fusha) → 3 tests pass → MVP
3. Add US2 (ar_egyptian) → 6 tests pass
4. Add US3 (ar_gulf) → 9 tests pass
5. Add US4 (lighter dialects) → 18 tests pass
6. Add US5 (English) → 21 tests pass
7. Add US6 (integration) → pipeline wired, Firestore persistence, 24+ tests pass
8. Polish → all green, no regressions

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are included per FR-013 requirement (3 per language minimum)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
